// =====================================================================
// EcoMaZ — Captures de vérification de la refonte (DESIGN.md §14 et §16)
// =====================================================================
// Ouvre l'application locale (http://localhost:5190) dans Microsoft Edge,
// y charge les données FICTIVES de l'école démo (donnees-demo.json, produit
// par exporter_demo.py) À LA PLACE de la base : aucune lecture des vraies
// données, aucune écriture (toute écriture est refusée dans l'aperçu).
// Photographie chaque écran à 360, 390 et 1440 px, en clair et en sombre.
//
// Usage : node tools/captures/capturer.mjs <nom> [écrans séparés par ,] [rôle]
//   ex.  node tools/captures/capturer.mjs avant dashboard,comptabilite direction
// Résultat : captures/<nom>/<écran>_<largeur>_<thème>.png
// =====================================================================
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const CACHE_CDN = new Map();
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');
const [nom = 'essai', listeEcrans = 'dashboard', role = 'direction', option = ''] = process.argv.slice(2);
const ecrans = listeEcrans.split(',').map(s => s.trim()).filter(Boolean);
const donnees = JSON.parse(readFileSync(join(ICI, 'donnees-demo.json'), 'utf8'));
// Option « demandes » : 3 demandes d'accès FICTIVES en mémoire (2 parents « sûrs », 1 enseignant)
if(option.split(',').includes('demandes')){
  const [e1, e2] = donnees.eleves;
  donnees.demandes_acces = [
    { id: 'dem-1', ecole_id: donnees._ecole_id, role_demande: 'parent', statut: 'en_attente', nom: e1.parent_nom || 'Parent Un', email: 'parent1@exemple.ci', telephone: e1.parent_tel, eleve_ids: [e1.id], created_at: '2026-10-18T08:00:00Z' },
    { id: 'dem-2', ecole_id: donnees._ecole_id, role_demande: 'parent', statut: 'en_attente', nom: e2.parent_nom || 'Parent Deux', email: 'parent2@exemple.ci', telephone: e2.parent_tel, eleve_ids: [e2.id], created_at: '2026-10-18T08:05:00Z' },
    { id: 'dem-3', ecole_id: donnees._ecole_id, role_demande: 'enseignant', statut: 'en_attente', nom: 'Awa Konan', email: 'ens@exemple.ci', telephone: '0700000099', classe_ids: [donnees.classes[0].id], created_at: '2026-10-18T08:10:00Z' } ];
}
// Console parent : comme la base (RLS), le parent ne voit que SES enfants → 2 élèves fictifs
if(role === 'parent'){
  const enfants = donnees.eleves.slice(0, 2).map(e => e.id);
  for(const k of Object.keys(donnees)) if(Array.isArray(donnees[k]) && k !== 'eleves' && donnees[k][0] && 'eleve_id' in donnees[k][0]) donnees[k] = donnees[k].filter(r => enfants.includes(r.eleve_id));
  donnees.eleves = donnees.eleves.filter(e => enfants.includes(e.id));
}
const LARGEURS = (process.env.UNE_TAILLE ? [[390, 844]] : [[360, 780], [390, 844], [1440, 900]]);
const THEMES = (process.env.CONTRASTE ? ['light', 'dark'] : process.env.UNE_TAILLE || process.env.AUDIT ? ['light'] : ['light', 'dark']);
const sortie = join(RACINE, 'captures', nom);
mkdirSync(sortie, { recursive: true });

// Remplace le client Supabase de la page par une copie des données démo (lecture seule)
function installerDemo(D){
  const lignes = t => (D[t] || []).map(r => ({ ...r }));
  const refus = () => { const r = { select(){ return r; }, eq(){ return r; }, in(){ return r; }, single(){ return r; }, maybeSingle(){ return r; },
    then(ok){ return Promise.resolve({ data: null, error: { message: 'Aperçu : écriture désactivée' } }).then(ok); } }; return r; };
  sb.from = (t) => {
    let rows = lignes(t), une = false, peutEtre = false, tete = false;
    const q = {
      select(_c, o){ if(o && o.head) tete = true; return q; },
      eq(c, v){ rows = rows.filter(r => String(r[c]) === String(v)); return q; },
      neq(c, v){ rows = rows.filter(r => String(r[c]) !== String(v)); return q; },
      in(c, vs){ const s = (vs || []).map(String); rows = rows.filter(r => s.includes(String(r[c]))); return q; },
      gte(c, v){ rows = rows.filter(r => r[c] >= v); return q; }, lte(c, v){ rows = rows.filter(r => r[c] <= v); return q; },
      gt(c, v){ rows = rows.filter(r => r[c] > v); return q; }, lt(c, v){ rows = rows.filter(r => r[c] < v); return q; },
      is(c, v){ rows = rows.filter(r => v === null ? r[c] == null : r[c] === v); return q; },
      not(){ return q; }, or(){ return q; }, ilike(){ return q; }, filter(){ return q; },
      order(c, o){ const asc = !o || o.ascending !== false; rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); return q; },
      limit(n){ rows = rows.slice(0, n); return q; }, range(a, b){ rows = rows.slice(a, b + 1); return q; },
      single(){ une = true; return q; }, maybeSingle(){ peutEtre = true; return q; },
      insert: refus, update: refus, delete: refus, upsert: refus,
      then(ok, ko){
        const res = tete ? { data: null, count: rows.length, error: null }
          : (une || peutEtre) ? { data: rows[0] || null, error: une && !rows[0] ? { message: 'aucune ligne' } : null }
          : { data: rows, count: rows.length, error: null };
        return Promise.resolve(res).then(ok, ko);
      },
    };
    return q;
  };
  sb.rpc = (nom) => Promise.resolve({ data: nom === 'compteur_portier_jour' ? 7 : [], error: null });
  try{ Object.defineProperty(sb, 'functions', { value: { invoke: async () => ({ data: { ok: true }, error: null }) }, configurable: true }); }catch(_e){}
  sb.auth.mfa.getAuthenticatorAssuranceLevel = async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
}

const navigateur = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' })); // Edge indisponible : navigateur intégré à l'outil
let n = 0;
for(const theme of THEMES){
  for(const [largeur, hauteur] of LARGEURS){
    const contexte = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, colorScheme: theme, deviceScaleFactor: 1, locale: 'fr-FR' });
    await contexte.addInitScript(t => { try{ localStorage.setItem('ecomaz_theme', t); }catch(_e){} }, theme);
    // Bibliothèques du CDN récupérées par Node puis servies à la page (Edge sans interface
    // reste parfois bloqué sur cdn.jsdelivr.net ; les vrais téléphones ne sont pas concernés).
    await contexte.route('https://cdn.jsdelivr.net/**', async route => {
      try{ const u = route.request().url(); if(!CACHE_CDN.has(u)) CACHE_CDN.set(u, execFileSync('curl', ['-sL', '-4', '-m', '30', u])); await route.fulfill({ status: 200, body: CACHE_CDN.get(u), headers: { 'content-type': 'application/javascript; charset=utf-8', 'access-control-allow-origin': '*' } }); }
      catch(_e){ await route.continue(); }
    });
    const page = await contexte.newPage();
    // TEXTE=grand / tres-grand : vérifie l'affichage avec la taille de texte choisie par l'utilisateur
    if(process.env.TEXTE) await page.addInitScript(t => { try{ localStorage.setItem('ecomaz_texte', t); }catch(_e){} }, process.env.TEXTE);
    // Option « lundi » : l'horloge de la page affiche lundi 19/10/2026 10:15 (jour de classe)
    if(option.split(',').includes('lundi')) await page.clock.setFixedTime(new Date('2026-10-19T10:15:00'));
    page.on('download', async d => { const f = join(sortie, d.suggestedFilename()); await d.saveAs(f); console.log('TÉLÉCHARGÉ : ' + f); });
    page.on('dialog', d => { console.log('DIALOGUE : ' + d.message()); d.accept(); });
    page.on('pageerror', e => console.log(`ERREUR PAGE (${largeur}px) : ${e.message}`));
    page.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) console.log(`CONSOLE (${largeur}px) : ${m.text().slice(0, 200)}`); });
    await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.evaluate(installerDemo, donnees);
    await page.evaluate(async ({ eid, role, option }) => {
      session.userId = 'apercu-demo'; session.ecoleId = eid; session.role = role;
      // Noms et civilités FICTIFS pour vérifier les salutations (secrétariat sans civilité : montre le choix)
      const P = { direction:['Junior ZOH','M'], fondation:['Blanche KOUAMÉ','F'], secretariat:['Aminata DIALLO',null], enseignant:['Clémentine KOUAKOU',null], parent:['Awa NAHI','F'], portier:['Koffi KONAN','M'] }[role] || ['Démo', null];
      session.nomComplet = P[0]; session.civilite = P[1];
      ui.role = role;
      // Nouveautés marquées comme déjà vues AVANT l'entrée (sinon la fenêtre couvre l'écran)
      VERSIONS.forEach(v => { try{ localStorage.setItem(`ecomaz_nouveautes_${v.version}_apercu-demo`, '1'); }catch(_e){} });
      if(role === 'parent'){ DB = await chargerDBParent(); enterAppParent(); return; }
      if(role === 'portier'){ DB = await chargerDBPortier(); enterAppPortier(); return; }
      DB = await chargerDB();
      // Option « sansfiche » : compte enseignant pas encore inscrit (montre « Je m'enrôle »)
      // Option « classesdem » : un enseignant FICTIF a demandé des classes depuis sa console
      if(option.split(',').includes('classesdem') && DB.enseignants[1]) DB.enseignants[1].classesDemandees = [DB.classes[2].id];
      if(role === 'enseignant' && option.split(',').includes('sansfiche')){ session.nomComplet = 'Enseignant Test'; }
      else if(role === 'enseignant' && DB.enseignants[0]){ session.enseignantId = DB.enseignants[0].id; DB.enseignants[0].classesAssignees = DB.enseignants[0].classesAssignees && DB.enseignants[0].classesAssignees.length ? DB.enseignants[0].classesAssignees : [DB.classes[0].id]; }
      // Option « parents » : 3 comptes parents FICTIFS en mémoire seulement (jamais en base),
      // pour photographier aussi l'état « Compte relié »
      // Option « edt » : emploi du temps FICTIF en mémoire seulement
      if(option.split(',').includes('edt')){
        const mats = ['Mathématiques', 'Français', 'Éveil', 'Lecture', 'Écriture', 'Anglais', 'Sport'];
        DB.emploiTemps = [];
        DB.classes.forEach((c, ci) => ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].forEach((j, ji) => (PERIODES_BY_CYCLE[c.cycle] || []).forEach((p, i) => {
          if(p.type === 'cours' && (i + ji) % 4 !== 3) DB.emploiTemps.push({ id: `edt-${ci}-${ji}-${i}`, classeId: c.id, jour: j, slotIndex: i, matiere: mats[(i + ji + ci) % mats.length], enseignantId: (DB.enseignants[ci % DB.enseignants.length] || {}).id });
        })));
      }
      // Option « pointage » : zone, pointages GPS et alerte FICTIFS en mémoire seulement
      if(option.split(',').includes('pointage')){
        const auj = todayISO(), [a, b] = DB.enseignants;
        DB.meta.geofenceLatitude = 5.35; DB.meta.geofenceLongitude = -4.0;
        DB.pointagesGps = [
          { id: 'gps-1', enseignantId: a.id, date: auj, heure: '07:24:00', action: 'arrivee', statut: 'dans_etablissement', distanceMetres: 38, latitude: 5.35, longitude: -4.0, adresseApprox: 'Cocody, Abidjan' },
          { id: 'gps-2', enseignantId: b.id, date: auj, heure: '07:51:00', action: 'arrivee', statut: 'a_verifier', distanceMetres: 412, latitude: 5.353, longitude: -4.003, adresseApprox: 'Riviera 2, Abidjan' } ];
        DB.alertesPointage = [{ id: 'al-1', enseignantId: b.id, date: auj, heure: '07:50:00', raison: 'Badge présenté depuis une capture d’écran', score: 82 }];
        DB.presencesEnseignants = DB.presencesEnseignants.concat([{ id: 'pe-1', enseignantId: a.id, date: auj, statut: 'Présent', heureArrivee: '07:24', methode: 'QR', motif: '' }, { id: 'pe-2', enseignantId: b.id, date: auj, statut: 'Retard', heureArrivee: '07:51', minutesRetard: 21, methode: 'GPS', motif: 'Embouteillage' }]);
      }
      // Option « vie » : tableau d'honneur, annonces, programmes et une publication FICTIFS en mémoire seulement
      if(option.split(',').includes('vie')){
        const [e1, e2] = DB.eleves, [t1, t2] = DB.enseignants, c = DB.classes;
        DB.tableauHonneur = [
          { categorie: 'eleve', periode: 'mois', nomAffiche: eleveFullName(e1), classeOuMatiere: classeName(e1.classeId), libellePeriode: 'Octobre 2026' },
          { categorie: 'eleve', periode: 'trimestre', nomAffiche: eleveFullName(e2), classeOuMatiere: classeName(e2.classeId), libellePeriode: '1er trimestre 2026-2027' },
          { categorie: 'enseignant', periode: 'mois', nomAffiche: ensFullName(t1), classeOuMatiere: 'Mathématiques', libellePeriode: 'Octobre 2026' } ];
        DB.actualitesAffichage = [ { id: 'ac-1', texte: 'Réunion des parents le vendredi 24 octobre à 17h', createdAt: '2026-10-16T09:00:00Z' }, { id: 'ac-2', texte: 'Vaccination gratuite à l’infirmerie mardi matin', createdAt: '2026-10-14T09:00:00Z' } ];
        DB.programmes = [0, 1, 2, 3].map(i => ({ id: 'pr-' + i, classeId: c[i % c.length].id, enseignantId: (i % 2 ? t2 : t1).id, matiere: ['Mathématiques', 'Français', 'Éveil', 'Lecture'][i], trimestre: 'Trimestre 1', progression: [85, 55, 20, 100][i], dateMaj: '2026-10-15' }));
        DB.fil = { charge: true, fin: true, pubs: [{ id: 'pub-1', titre: 'Journée de la lecture', texte: 'Les élèves du CP ont présenté leurs livres préférés aux parents. Merci à tous pour votre présence !', createdAt: '2026-10-16T10:00:00Z', dateEvenement: '2026-10-15', classeIds: null }], medias: {}, reactions: { 'pub-1': [{ type: 'coeur', userId: 'x' }, { type: 'bravo', userId: 'y' }] }, commentaires: {}, ouverts: {}, urls: {} };
      }
      if(option.split(',').includes('parents')){
        const el = DB.eleves.slice(0, 4);
        DB.profiles = (DB.profiles || []).concat(el.slice(0, 3).map((e, i) => ({ id: 'parent-fictif-' + i, role: 'parent', nomComplet: e.parentNom || ('Parent ' + e.nom) })));
        DB.parentsEleves = (DB.parentsEleves || []).concat(el.slice(0, 3).map((e, i) => ({ id: 'lien-fictif-' + i, parentProfileId: 'parent-fictif-' + i, eleveId: e.id })));
      }
      enterApp();
    }, { eid: donnees._ecole_id, role, option });
    for(const ecranBrut of ecrans){
      // « ecran+centre » : ouvre aussi le centre de notifications avant la capture
      // « ecran:onglet » : ouvre un sous-onglet (ex. comptabilite:scolarite)
      const [ecranOnglet, extra] = ecranBrut.split('+');
      const [ecran, onglet] = ecranOnglet.split(':');
      await page.evaluate(([v, o, r]) => { closeModal && closeModal(); if(typeof closeSmartFillModal === 'function') closeSmartFillModal();
        if(r === 'parent'){ navParent(v); window.scrollTo(0, 0); return; }
        if(r === 'portier'){ ui.filters.portierClasse = null; refreshPortierDashboard(); window.scrollTo(0, 0); return; }
        if(o){ ui.filters.comptaTab = o; ui.filters.cahierOnglet = o; ui.filters.presEnsOnglet = o; } go(v); window.scrollTo(0, 0); }, [ecran, onglet, role]);
      await page.waitForTimeout(900);
      if(extra === 'centre') await page.evaluate(() => { toggleCentre(true); });
      // Gestes d'essai (aucune écriture) : ouvrir une feuille ou un menu avant la photo
      const GESTES = {
        relier: () => { const d = document.querySelector('.pe-carte[data-etat="non"] .pe-relier'); d.open = true; const c = d.querySelector('.pe-cherche'); c.value = 'aka'; c.dispatchEvent(new Event('input')); d.scrollIntoView({ block: 'center' }); },
        plus: () => { const d = document.querySelector('.pe-carte[data-etat="non"] .pe-plus'); d.open = true; d.scrollIntoView({ block: 'center' }); },
        inviter: () => { document.querySelector('.pe-carte[data-etat="non"] .pe-actions .btn').click(); },
        absent: () => { document.querySelectorAll('.cj-btn[data-s="Absent"]')[1].click(); document.querySelectorAll('.cj-btn[data-s="Retard"]')[2].click(); },
        menu: () => { const d = [...document.querySelectorAll('.menu-plus')].pop(); d.open = true; d.scrollIntoView({ block: 'center' }); },
        classes: () => { const r = document.querySelector('input[name=cible][value=classes]'); r.click(); document.querySelectorAll('input[name=classe]')[1].click(); r.scrollIntoView({ block: 'center' }); },
        modal: () => { openEleveForm(); },
        enfant2: () => { document.querySelectorAll('.aj-enfant')[1].click(); },
        classe: () => { document.querySelector('.gate-classe').click(); },
        succes: () => { const e = DB.eleves[0]; $('#viewContainer').innerHTML = renderEtatPortier('ok', e, { heure: '07h42' }); },
        refus: () => { const e = DB.eleves[0]; $('#viewContainer').innerHTML = renderEtatPortier('erreur', e, { message: 'Pas de connexion internet.' }); },
        groupe: () => { ouvrirMessageGroupeClasse(DB.classes[0].id); },
        demandes: () => { document.getElementById('panneauDemandesAcces').scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        approuver: () => { approuverDemandesSures(); },
        sauvegarde: () => { exporterSauvegardeComplete(); },
        rapport: () => { ouvrirRapportMois('2026-10'); },
        liste: () => { ouvrirListeClasse(DB.classes[0].id); },
        contacts: () => { ouvrirListeClasse(DB.classes[0].id, 'contacts'); },
        emarg: () => { ouvrirListeClasse(DB.classes[0].id, 'emargement'); },
        cartes: () => { ouvrirCartesScolaires(DB.classes[0].id); },
        relance: () => { ouvrirRelanceEnseignants(); },
        etatbull: () => { confirmerPublicationBulletins(trimestreCourant(), true); },
        publication: () => { confirmerPublicationBulletins(trimestreCourant()); },
        reprisegroupe: () => { ouvrirRepriseVersements(ui.filters.comptaClasse || DB.classes[0].id); const b = document.querySelector('.rv-groupe .dv-puce'); if(b) b.click(); const m = document.querySelectorAll('.rv-montant'); if(m[0]) { m[0].value = ''; totalReprise(); } },
        rappelscol: () => { const e = DB.eleves[0]; DB.meta.scolariteVisibleParents = true; DB.versementsSaisis = true; DB.paiementEnLigne = { actif: true, prestataire: 'paydunya' }; const d = new Date(); const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-05`; DB.echeancesScolarite = [{ id:'t1', label:'1er versement', montant:30000, dateEcheance: iso.slice(0,8) + '01', classeId: e.classeId, ordre:1 }, { id:'t2', label:'2e versement', montant:30000, dateEcheance: iso, classeId: e.classeId, ordre:2 }]; DB.paiementsScolarite = [{ eleveId: e.id, tranche:'1er versement', montant:30000 }]; $('#viewContainer').innerHTML = renderParentDashboard(); document.querySelectorAll('#viewContainer details').forEach(d => d.open = true); window.scrollTo(0, 0); },
        sonnerie: async () => { ouvrirSonnerieAppel(); const u = fichierBip(); const buf = await (await fetch(u)).arrayBuffer(); const C = window.AudioContext || window.webkitAudioContext; const ctx = new C(); const dec = await ctx.decodeAudioData(buf); window.__testBip = { octets: buf.byteLength, duree: Math.round(dec.duration * 100) / 100 }; console.log('TESTBIP ' + JSON.stringify(window.__testBip)); },
        obligatoire: () => { DB.horairesAnnonces = Object.assign({}, DB.horairesAnnonces || {}, { rappelAppel: '00:01:00', joursCours: [1,2,3,4,5,6,7] }); DB.agenda = []; DB.presencesEleves = DB.presencesEleves.filter(x => x.date !== todayISO()); verifierAppelObligatoire(true); },
        guideens: () => { imprimerGuideEnseignant(); },
        pmsg: async () => { navParent('msg'); await new Promise(r => setTimeout(r, 700)); },
        pvie: async () => { navParent('vie'); await new Promise(r => setTimeout(r, 900)); document.querySelectorAll('#viewContainer details').forEach(d => d.open = true); },
        pobjets: async () => { navParent('objets'); await new Promise(r => setTimeout(r, 900)); },
        toutouvert: async () => { if(ui.role === 'parent'){ const e = DB.eleves[0]; DB.meta.bulletinsPublies = [trimestreCourant()]; DB.meta.scolariteVisibleParents = true; DB.notes = (DB.notes || []).concat([{ eleveId: e.id, matiere: 'Langage', note: 14, noteSur: 20, trimestre: trimestreCourant(), type: 'Composition', date: todayISO() }]); $('#viewContainer').innerHTML = renderParentDashboard(); } else renderView(ui.currentView || 'dashboard'); document.querySelectorAll('#viewContainer details').forEach(d => d.open = true); await new Promise(r => setTimeout(r, 900)); },
        bullparent: async () => { const e = DB.eleves[0]; DB.meta.bulletinsPublies = [trimestreCourant()]; DB.notes = (DB.notes || []).concat([{ eleveId: e.id, matiere: 'Langage', note: 14, noteSur: 20, trimestre: trimestreCourant(), type: 'Composition', date: todayISO() }]); $('#viewContainer').innerHTML = renderParentDashboard(); const d = document.querySelector('.enfant-bulletin'); if(d){ d.open = true; } await new Promise(r => setTimeout(r, 800)); d && d.scrollIntoView({ block: 'start' }); },
        absjustif: () => { const e = DB.eleves[0]; DB.absencesSignalees = []; DB.presencesSemaine = (DB.presencesSemaine || []).filter(p => p.date !== todayISO()).concat([{ eleveId: e.id, date: todayISO(), statut: 'Absent' }]); $('#viewContainer').innerHTML = renderParentDashboard(); window.scrollTo(0, 0); },
        profilparent: () => { ouvrirProfilParent(); },
        coupons: async () => { window.__codesInvitation = {}; famillesARelancer(null).forEach((f, i) => { if(f.tel) window.__codesInvitation[f.tel] = 'CODEESSAI' + i + 'abcdef'; }); await imprimerInvitationsPapier(''); },
        avancement: () => { const c = classesVisibles()[0]; DB.programmes = [{ id:'prog-essai', enseignantId: session.enseignantId, classeId: c.id, matiere:'Langage', trimestre: trimestreCourant(), progression: 40, dateMaj:'2026-09-20', contenu:'' }]; renderView('programmes'); ouvrirAvancement('prog-essai'); },
        nouvprog: () => { openProgrammeForm(); },
        nouveval: () => { ouvrirNouvelleEvaluation(); const r = document.querySelectorAll('input[name=noteSur]'); if(r[0]){ r[0].checked = true; choisirPuceRadio(r[0]); } },
        saisieeval: () => { const f = ui.filters.camps; DB.evaluations = [{ id:'ev-essai', classeId:f.classeId, matiere:f.matiere, trimestre:f.trimestre, type:'Devoir', titre:'Les fractions', date:todayISO(), noteSur:20 }]; ui.filters.campsEval = 'ev-essai'; renderView('camps-de-base'); const i = document.querySelectorAll('[name^=n_]'); if(i[0]){ i[0].value = 14; i[0].form.dispatchEvent(new Event('input', { bubbles:true })); } },
        relpar: () => { ouvrirRelanceParents(); const a = document.querySelector('.relance-ligne a'); if(a){ a.removeAttribute('href'); a.click(); } },
        meredt: async () => { eval(etapesMiseEnRoute().find(e => e.bouton === 'Remplir rapidement').action); await new Promise(r => setTimeout(r, 500)); },
        merpaie: async () => { eval(etapesMiseEnRoute().find(e => e.bouton === 'Saisir les versements reçus').action); await new Promise(r => setTimeout(r, 500)); },
        reprise: () => { ouvrirRepriseVersements(ui.filters.comptaClasse || DB.classes[0].id); const i = document.querySelectorAll('.rv-ech button'); if(i[0]) i[0].click(); if(i[3]) i[3].click(); const m = document.querySelectorAll('.rv-montant'); if(m[5]){ m[5].value = 5000; totalReprise(); } },
        repriseok: async () => { dbInsertMany = async (t, l) => l.map(r => ({ ...r, id: crypto.randomUUID() })); window.confirm = () => true; ouvrirRepriseVersements(ui.filters.comptaClasse || DB.classes[0].id); document.querySelectorAll('.rv-ech button').forEach((b, k) => { if(k % 2 === 0) b.click(); }); await enregistrerReprise(ui.filters.comptaClasse || DB.classes[0].id); },
        remplir: () => { ouvrirRemplissageEdt(ui.filters.ttClasse || DB.classes[0].id); },
        proposition: async () => { dbInsertMany = async (t, l) => l.map(r => ({ ...r, id: crypto.randomUUID() })); await remplirEdt(ui.filters.ttClasse || DB.classes[0].id, 'proposition'); },
        listeens: () => { ouvrirListeEnseignants(); },
        repondre: () => { const f = document.querySelector('.question-appel'); f.querySelector('input[value=F]').click(); f.querySelector('#nomAppel').value = 'NAHI'; apercuAppellation(); f.requestSubmit(); },
        approuver1: () => { document.querySelector('.dem-carte .btn.sm').click(); },
        profil: () => { ui.eleveProfileId = DB.eleves[0].id; renderView('eleves'); window.scrollTo(0, 0); },
        ongletbulletin: () => { ui.eleveProfileId = DB.eleves[0].id; ui.filters.profilOnglet = 'bulletin'; renderView('eleves'); window.scrollTo(0, 0); },
        ongletpres: () => { ui.eleveProfileId = DB.eleves[0].id; ui.filters.profilOnglet = 'presences'; renderView('eleves'); window.scrollTo(0, 0); },
        horaires: () => { const f = enseignantById(session.enseignantId); const c = f.classesAssignees[0]; f.creneaux = [1, 2, 4].map(j => ({ classe: c, jour: j, debut: '07:30', fin: '12:00' })).concat([{ classe: c, jour: 3, debut: '07:30', fin: '10:00' }]); ui.filters.enroleOuvert = true; renderView('dashboard'); const d = document.querySelector('.acc-annexe'); if(d) d.open = true; document.querySelector('.creneaux-editeur')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); },
        horairesvu: () => { const f = enseignantById(session.enseignantId); const c = f.classesAssignees[0]; f.creneaux = [1, 2, 4].map(j => ({ classe: c, jour: j, debut: '07:30', fin: '12:00' })); ui.filters.enroleOuvert = false; renderView('dashboard'); const d = document.querySelector('.acc-annexe'); if(d){ d.open = true; d.scrollIntoView({ block: 'start' }); } },
        sanshoraire: () => { const f = enseignantById(session.enseignantId); f.creneaux = []; renderView('dashboard'); window.scrollTo(0, 0); },
        appelhoraire: () => { const f = enseignantById(session.enseignantId); const d = new Date(); const j = ((d.getDay() + 6) % 7) + 1; const hh = n => String(n).padStart(2, '0'); const debut = `${hh(Math.max(0, d.getHours() - 1))}:00`; f.creneaux = j <= 6 ? [{ classe: f.classesAssignees[0], jour: j, debut, fin: '23:59' }] : []; DB.horairesAnnonces = Object.assign({}, DB.horairesAnnonces || {}, { joursCours: [1,2,3,4,5,6,7] }); DB.agenda = []; DB.presencesEleves = DB.presencesEleves.filter(x => x.date !== todayISO()); window.__classesAppel = classesAppelObligatoire().map(c => c.nom); console.log('APPEL ' + JSON.stringify(window.__classesAppel)); f.creneaux = []; console.log('SANSHORAIRE ' + JSON.stringify(classesAppelObligatoire().map(c => c.nom))); },
        sujetdoc: () => { nouveauSujet(); Object.assign(ui.sujet, { titre: 'Devoir de mathématiques n°2 — les fractions', duree: '1 heure', datePrevue: todayISO(), contenuHtml: '<p><strong>Consigne :</strong> lisez chaque question.</p><h3>Exercice 1</h3><ol><li>Calcule : 3/4 + 1/4 = ……………</li><li>Range : 1/2 ; 1/4 ; 3/4</li></ol><h3>Exercice 2</h3><table><tbody><tr><th>Fraction</th><th>Décimal</th></tr><tr><td>1/2</td><td>……</td></tr></tbody></table><p onclick="alert(1)">Bonne chance<script>alert(2)</script><img src="x" onerror="alert(3)"></p>' }); ui.sujetImport = false; renderView('creer-evaluation'); window.__xss = document.querySelectorAll('#sujetDoc script, #sujetDoc [onclick], #sujetDoc img[onerror]').length; console.log('XSS ' + window.__xss); },
        sujetedit: () => { nouveauSujet(); Object.assign(ui.sujet, { titre: 'Interrogation de français', contenuHtml: '<h3>Exercice 1</h3><p>Conjugue au présent : chanter ……………</p>' }); ui.sujetImport = false; ui.sujetEdition = true; renderView('creer-evaluation'); document.querySelector('.sujet-barre')?.scrollIntoView({ block: 'start' }); },
        sujetnouveau: () => { nouveauSujet(); },
        sujetliste: () => { const f = enseignantById(session.enseignantId); const c = f.classesAssignees[0]; DB.sujets = [{ id: 's1', enseignantId: f.id, classeId: c, matiere: 'Mathématiques', type: 'Devoir', titre: 'Devoir n°2 — les fractions', statut: 'brouillon', contenuHtml: '<p>x</p>', datePrevue: todayISO() }, { id: 's2', enseignantId: f.id, classeId: c, matiere: 'Français', type: 'Composition', titre: 'Composition du 1er trimestre', statut: 'validee', valideLe: new Date().toISOString(), contenuHtml: '<p>x</p>' }]; ui.sujet = null; renderView('creer-evaluation'); },
        boite: () => { const [t1, t2] = DB.enseignants; const c = DB.classes; DB.sujets = [{ id: 'b1', enseignantId: t1.id, classeId: c[0].id, matiere: 'Mathématiques', type: 'Devoir', titre: 'Devoir n°2 — les fractions', statut: 'validee', valideLe: new Date().toISOString(), datePrevue: todayISO(), duree: '1 heure', contenuHtml: '<h3>Exercice 1</h3><ol><li>Calcule : 3/4 + 1/4 = ……</li></ol>' }, { id: 'b2', enseignantId: t2.id, classeId: c[1].id, matiere: 'Français', type: 'Composition', titre: 'Composition du 1er trimestre', statut: 'validee', valideLe: '2026-11-10T09:00:00Z', contenuHtml: '<h3>Dictée</h3><p>……</p>' }]; ui.boiteVu = '2026-11-12T00:00:00Z'; renderView('boite-evaluations'); },
        boiteimp: () => { const [t1, t2] = DB.enseignants; const c = DB.classes; DB.sujets = [{ id: 'b1', enseignantId: t1.id, classeId: c[0].id, matiere: 'Mathématiques', type: 'Devoir', titre: 'Devoir n°2 — les fractions', statut: 'validee', valideLe: new Date().toISOString(), datePrevue: todayISO(), duree: '1 heure', contenuHtml: '<h3>Exercice 1</h3><ol><li>Calcule : 3/4 + 1/4 = ……</li></ol><table><tbody><tr><th>Fraction</th><th>Décimal</th></tr><tr><td>1/2</td><td>……</td></tr></tbody></table>' }]; renderView('boite-evaluations'); imprimerSujets(DB.sujets); },
        fichehoraires: () => { const t = DB.enseignants[0]; t.creneaux = [{ classe: t.classesAssignees[0], jour: 1, debut: '07:30', fin: '12:00' }, { classe: t.classesAssignees[0], jour: 3, debut: '07:30', fin: '12:00' }]; openEnseignantForm(t.id); document.querySelector('.creneaux-editeur')?.scrollIntoView({ block: 'center' }); },
        edtfictif: () => { const J = ['Lundi', 'Mardi', 'Jeudi', 'Vendredi']; DB.emploiTemps = DB.classes.flatMap(c => J.map((jour, k) => ({ id: c.id + k, classeId: c.id, jour, slotIndex: 0, matiere: 'Cours', heureDebut: '08:00:00', heureFin: '16:00:00' }))); DB.enseignants.forEach(t => { t.creneaux = []; }); },
        suivihoraires: () => { GESTES_EXTRA.edtfictif(); DB.enseignants[0].creneaux = [{ classe: DB.enseignants[0].classesAssignees[0], jour: 1, debut: '08:00', fin: '16:00' }]; renderView('enseignants'); window.scrollTo(0, 0); },
        remplirhoraires: () => { GESTES_EXTRA.edtfictif(); renderView('enseignants'); ouvrirRemplissageHoraires(); },
        horairespropose: () => { GESTES_EXTRA.edtfictif(); ui.filters.enroleOuvert = true; renderView('dashboard'); const d = document.querySelector('.acc-annexe'); if(d) d.open = true; document.querySelector('.creneaux-editeur')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); },
        edtprimaire: () => { const J = ['Lundi', 'Mardi', 'Jeudi', 'Vendredi']; DB.emploiTemps = DB.classes.filter(c => c.cycle === 'Primaire').flatMap(c => J.map((jour, k) => ({ id: c.id + k, classeId: c.id, jour, slotIndex: 0, matiere: 'Cours', heureDebut: '08:00:00', heureFin: '16:00:00' }))); DB.horairesAnnonces = Object.assign({}, DB.horairesAnnonces || {}, { joursCours: [1, 2, 4, 5], matinDebutMaternelle: '08:00:00', apresmidiFinMaternelle: '16:00:00', matinDebutPrimaire: '07:30:00', apresmidiFinPrimaire: '16:00:00' }); DB.enseignants.forEach(t => { t.creneaux = []; }); renderView('enseignants'); ouvrirRemplissageHoraires(); },
        tachenotes: () => { const f = enseignantById(session.enseignantId); const c = f.classesAssignees[0]; DB.sujets = [{ id: 's1', enseignantId: f.id, classeId: c, matiere: 'Langage', type: 'Devoir', titre: 'Les fractions', statut: 'validee', valideLe: new Date().toISOString(), datePrevue: todayISO(), contenuHtml: '<p>x</p>' }, { id: 's2', enseignantId: f.id, classeId: c, matiere: 'Langage', type: 'Composition', titre: 'Composition du 1er trimestre', statut: 'validee', valideLe: new Date().toISOString(), datePrevue: isoDansJours(-2), contenuHtml: '<p>x</p>' }]; DB.evaluations = []; DB.notes = []; DB.devoirs = DB.devoirs || []; renderView('dashboard'); const t = [...document.querySelectorAll('.tache')].find(x => /Saisir les notes/.test(x.textContent)); if(t) t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); },
        doublons: () => { const e = DB.eleves[0]; DB.eleves.push({ ...e, id: 'dbl-1', matricule: 'EL-0999' }); try{ localStorage.removeItem('ecomaz_doublons_ok'); }catch(_e){} renderView('eleves'); window.scrollTo(0, 0); document.querySelector('.panneau-doublons')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        echeancier: () => { const an = (DB.meta.anneeScolaire || '2026-2027').split('-'); DB.echeancesScolarite = DB.classes.flatMap(c => [{ id: 'e0' + c.id, classeId: c.id, label: 'Frais d’inscription', montant: 80000, dateEcheance: an[1] + '-03-10', ordre: 0 }, { id: 'e1' + c.id, classeId: c.id, label: '1er versement', montant: 100000, dateEcheance: an[0] + '-10-05', ordre: 1 }, { id: 'e2' + c.id, classeId: c.id, label: '2e versement', montant: 100000, dateEcheance: an[1] + '-09-05', ordre: 2 }]).concat([{ id: 'g1', classeId: null, label: '1er Versement', montant: 100000, dateEcheance: null, ordre: 1 }]); ui.filters.comptaTab = 'scolarite'; renderView('comptabilite'); window.scrollTo(0, 0); },
        sfouvrir: () => { const b = document.querySelector('.modal-backdrop.open .btn-sf, #viewContainer .btn-sf'); if(!b){ console.error('SF AUCUN BOUTON'); return; } b.click(); const sc = window.__smartFillSchema || []; console.error('SF ' + window.__smartFillFormulaire + ' ' + sc.length + ' champs : ' + sc.map(c => c.name + (c.format && c.format.startsWith('une valeur') ? '[' + (c.format.split('|').length) + ' options]' : '')).join(', ')); },
        sfvente: () => { if(!DB.gadgets.length) DB.gadgets.push({ id: 'g-essai', nom: 'Cahier 200 pages', prixUnitaire: 500, stock: 40 }); ui.filters.comptaTab = 'ventes'; renderView('comptabilite'); GESTES_EXTRA.sfouvrir(); },
        sfventevue: () => { if(!DB.gadgets.length) DB.gadgets.push({ id: 'g-essai', nom: 'Cahier 200 pages', prixUnitaire: 500, stock: 40 }); ui.filters.comptaTab = 'ventes'; renderView('comptabilite'); document.querySelector('#formVente')?.scrollIntoView({ block: 'center' }); },
        sfdevoirvue: () => { go('devoirs'); document.querySelector('#formDevoir')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        sfcantinevue: async () => { go('cantine'); await new Promise(r => setTimeout(r, 900)); document.querySelector('.btn-sf')?.scrollIntoView({ block: 'center' }); },
        sfcantine: async () => { go('cantine'); await new Promise(r => setTimeout(r, 900)); GESTES_EXTRA.sfouvrir(); },
        sfdevoir: () => { go('devoirs'); GESTES_EXTRA.sfouvrir(); },
        sfecheance: () => { openEcheanceForm(); GESTES_EXTRA.sfouvrir(); },
        sfassistant: () => { ouvrirAssistantScolarite(); GESTES_EXTRA.sfouvrir(); },
        sfpersonne: () => { afficherSecuriteEleve(DB.eleves[0]); GESTES_EXTRA.sfouvrir(); },
        sfecole: () => { go('parametres'); GESTES_EXTRA.sfouvrir(); },
        sfprog: () => { openProgrammeForm(); GESTES_EXTRA.sfouvrir(); },
        sfseance: () => { openSeanceForm(DB.classes[0].id, 'Lundi'); GESTES_EXTRA.sfouvrir(); },
        sfpaiement: () => { const pid = (DB.paiementsScolarite || [])[0]?.id; if(pid) openModifierPaiementScolariteForm(pid); else openPaiementScolariteForm(DB.eleves[0].id, ''); GESTES_EXTRA.sfouvrir(); },
        sfgadget: () => { openGadgetForm(); GESTES_EXTRA.sfouvrir(); },
        sfpublication: () => { go('vie-ecole'); GESTES_EXTRA.sfouvrir(); },
        sfboutons: () => { ui.filters.comptaTab = 'ventes'; renderView('comptabilite'); document.querySelector('#viewContainer .btn-sf')?.scrollIntoView({ block: 'center' }); },
        modeeleve: () => { openEleveForm(); },
        modedepense: () => { openDepenseForm(); },
        modemanuel: () => { openDepenseForm(); document.querySelector('.cr-manuel').click(); },
        sfreprise: () => { const c = DB.classes[0].id; ouvrirRepriseVersements(c); const sc = schemaReprise(c); const r = {}; sc.slice(0, 3).forEach((f, k) => { r[f.name] = { valeur: String([30000, 999999999, 180000][k]), confiance: k === 2 ? 'moyen' : 'élevé' }; }); window.alert = m => console.error('ALERTE ' + m.replace(/\n/g, ' | ')); appliquerReprise(r); console.error('SF reprise ' + sc.length + ' champs ; remplis : ' + [...document.querySelectorAll('.rv-montant')].filter(i => i.value).map(i => i.dataset.tranche + '=' + i.value).join(', ')); document.querySelector('.rv-montant.champ-pre-rempli')?.scrollIntoView({ block: 'center' }); },
        sfreprisevue: () => { ouvrirRepriseVersements(DB.classes[0].id); },
        sfnotes: () => { const f = ui.filters.camps; DB.evaluations = [{ id:'ev-essai', classeId:f.classeId, matiere:f.matiere, trimestre:f.trimestre, type:'Devoir', titre:'Les fractions', date:todayISO(), noteSur:20 }]; ui.filters.campsEval = 'ev-essai'; renderView('camps-de-base'); const ids = window.__notesSf.ids; const c1 = champNote('camps', ids[1]); if(c1) c1.value = '9'; const r = {}; r['note_' + ids[0]] = { valeur: '12.5', confiance: 'élevé' }; r['note_' + ids[1]] = { valeur: '15', confiance: 'élevé' }; r['note_' + ids[2]] = { valeur: '25', confiance: 'élevé' }; if(ids[3]) r['note_' + ids[3]] = { valeur: '7', confiance: 'moyen' }; window.alert = m => console.error('ALERTE ' + m.replace(/\n/g, ' | ')); appliquerNotesLues(r); console.error('SF notes ' + schemaNotes(ids, 20).length + ' champs ; valeurs : ' + ids.slice(0, 4).map(i => champNote('camps', i).value || '∅').join(' / ') + ' ; compteur ' + document.getElementById('campsCompteur').textContent); },
        sfcompo: () => { renderView('notes'); const ids = window.__notesSf.ids; const r = {}; r['note_' + ids[0]] = { valeur: '13.75', confiance: 'élevé' }; appliquerNotesLues(r); console.error('SF compo ' + champNote('compo', ids[0]).value + ' ; compteur ' + (document.getElementById('compteurCompo') || {}).textContent); document.querySelector('.nt-note.champ-pre-rempli')?.scrollIntoView({ block: 'center' }); },
        sfquota: () => { openDepenseForm(); quotaRemplissage = { utilise: 84, limite: 100 }; document.querySelector('.cr-intelligent').click(); sb.rpc = async () => ({ data: { utilise: 84, limite: 100 } }); majQuotaRemplissage(); },
        miseenroute: () => { const e = DB.eleves[0]; DB.eleves.push({ ...e, id: 'dbl-2', matricule: 'EL-0998' }); DB.enseignants.forEach(t => { t.creneaux = []; }); try{ localStorage.removeItem('ecomaz_doublons_ok'); }catch(_e){} const et = etapesMiseEnRoute(); console.error('ETAPES ' + et.filter(x => /Horaires de cours|double|Échéancier cohérent/.test(x.titre)).map(x => `${x.ok ? 'OK' : 'A FAIRE'} ${x.titre} (${x.detail})`).join(' | ')); renderView('dashboard'); const t = [...document.querySelectorAll('#viewContainer *')].find(x => x.children.length === 0 && /Horaires de cours des enseignants/.test(x.textContent)); if(t) t.scrollIntoView({ block: 'center' }); },
        echtrop: () => { const c = DB.classes[0].id; const els = DB.eleves.filter(e => e.classeId === c).slice(0, 2); DB.echeancesScolarite = [{ id: 'x0', classeId: c, label: 'Frais d’inscription', montant: 50000, dateEcheance: '2026-09-10', ordre: 0 }, { id: 'x1', classeId: c, label: '3e versement', montant: 500, dateEcheance: '2026-12-05', ordre: 3 }]; DB.paiementsScolarite = els.map((e, k) => ({ id: 'p' + k, eleveId: e.id, tranche: 'Frais d’inscription', montant: 80000, date: '2026-11-15' })); ui.filters.comptaTab = 'scolarite'; ui.filters.comptaClasse = c; renderView('comptabilite'); console.error('ANOM ' + anomaliesEcheancier().map(x => x.type).join(',')); window.scrollTo(0, 0); },
        recusfictifs: () => { const m = thisMonthISO(); DB.recus = DB.eleves.slice(0, 5).map((e, k) => ({ id: 'r' + k, numero: 'R2026-0000' + (k + 1), enregistrementId: 'p' + k, eleveId: e.id, montant: 50000 + k * 10000, objet: 'Scolarité — 1er versement', modePaiement: 'Espèces', datePaiement: m + '-15', emisLe: m + '-15T10:00:00Z', enLigne: false })); },
        souchesclasse: () => { GESTES_EXTRA.recusfictifs(); ui.filters.soucheClasse = ''; ouvrirSouchesRecus(); },
        recuslot: () => { GESTES_EXTRA.recusfictifs(); ui.filters.soucheClasse = ''; imprimerRecusGroupes(thisMonthISO()); console.error('RECUS ' + document.querySelectorAll('.recus-lot .recu').length); },
        cantinevide: () => { DB.activites = (DB.activites || []).filter(x => x.type !== 'cantine'); ui.filters.comptaTab = 'cantine'; renderView('comptabilite'); },
        cantinepleine: () => { const id = 'cant-1'; DB.activites = (DB.activites || []).filter(x => x.type !== 'cantine').concat([{ id, nom: 'Cantine', type: 'cantine', montantCotisation: 15000, periode: 'Mensuel' }]); const d = new Date(); const ilya = n => { const x = new Date(d.getFullYear(), d.getMonth() - n, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`; }; const els = DB.eleves.slice(0, 4); DB.inscriptionsActivites = (DB.inscriptionsActivites || []).concat(els.map((e, k) => ({ id: 'ic' + k, eleveId: e.id, activiteId: id, dateInscription: ilya(k % 3) }))); DB.paiementsCotisations = (DB.paiementsCotisations || []).concat([{ id: 'pc0', eleveId: els[0].id, activiteId: id, montant: 15000, date: thisMonthISO() + '-02', modePaiement: 'Espèces' }, { id: 'pc1', eleveId: els[1].id, activiteId: id, montant: 15000, date: thisMonthISO() + '-03', modePaiement: 'Mobile Money' }]); DB.depenses = (DB.depenses || []).concat([{ id: 'dr', categorie: 'Restauration', montant: 20000, date: thisMonthISO() + '-04', libelle: 'Riz et huile' }]); ui.filters.comptaTab = 'cantine'; renderView('comptabilite'); console.error('CANT ' + els.map(e => { const s = situationCantine(e.id); return `${s.periodes}p du=${s.du} paye=${s.paye} reste=${s.reste}`; }).join(' | ') + ' ; activites-tab ' + (() => { ui.filters.comptaTab = 'activites'; const h = renderComptaActivites(); ui.filters.comptaTab = 'cantine'; return /Cantine/.test(h) ? 'MONTRE LA CANTINE' : 'sans cantine'; })()); },
        cantineinscr: () => { GESTES_EXTRA.cantinepleine(); ouvrirInscriptionCantine(DB.classes[1].id); },
        choixfonction: () => { afficherChoixFonction([{ role: 'direction', active: true }, { role: 'secretariat' }, { role: 'enseignant', enseignantId: DB.enseignants[0].id }]); },
        fonctionspanel: () => { const p = (DB.profiles || []).find(x => x.role === 'direction') || { id: 'pdir', role: 'direction', nomComplet: 'Directeur Essai' }; if(!(DB.profiles || []).includes(p)) DB.profiles = (DB.profiles || []).concat([p]); DB.fonctionsCompte = [{ userId: p.id, role: 'direction', enseignantId: null }, { userId: p.id, role: 'enseignant', enseignantId: DB.enseignants[1].id }]; window.__fonctions = [{ role: 'direction', active: true }, { role: 'enseignant' }]; renderView('enseignants'); applyRoleVisibility(); document.querySelector('.panneau-fonctions')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); console.error('BOUTON ' + !document.getElementById('btnChangerFonction').hidden + ' | ACCES ' + (document.body.innerText.match(/Accès actif/g) || []).length); },
        pservices: async () => { navParent('services'); await new Promise(r => setTimeout(r, 500)); console.error('PSVC ' + document.querySelectorAll('.svc-carte').length + ' cartes'); },
        menutuiles: () => { document.getElementById('sidebar')?.classList.add('open'); document.getElementById('sidebarBackdrop')?.classList.add('open'); },
        kinscrits: () => { basculerRubrique('k-inscrits', true); const d = document.getElementById('rub-k-inscrits'); d?.closest('.db-rubriques')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        kpointes: () => { basculerRubrique('k-pointes', true); const d = document.getElementById('rub-k-pointes'); d?.closest('.db-rubriques')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        knonpointes: () => { basculerRubrique('k-nonpointes', true); const d = document.getElementById('rub-k-nonpointes'); d?.closest('.db-rubriques')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        kpresents: () => { const auj = todayISO(); DB.classes.slice(0, 2).forEach(c => DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif').forEach((e, i) => DB.presencesEleves.push({ id: 'pf-' + e.id, eleveId: e.id, classeId: c.id, date: auj, statut: i % 5 === 3 ? 'Absent' : i % 7 === 2 ? 'Retard' : 'Présent' }))); renderView('dashboard'); basculerRubrique('k-presents', true); const d = document.getElementById('rub-k-presents'); d?.closest('.db-rubriques')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        kpresenceens: () => { basculerRubrique('k-presence-ens', true); const d = document.getElementById('rub-k-presence-ens'); d?.closest('.db-rubriques')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        monpointage: () => { DB.meta.geofenceLatitude = 5.38; DB.meta.geofenceLongitude = -3.92; DB.meta.geofenceRayonMetres = 100; renderView('dashboard'); basculerRubrique('pointage', true); document.getElementById('rub-pointage')?.closest('.db-rubriques')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        ptrefus: () => { afficherResultatPointage({ ok: false, refuse: true, raison: 'Hors de l’établissement : à 412 m de l’école (zone de 100 m)' }, 'arrivee'); },
        ptok: () => { afficherResultatPointage({ ok: true, action: 'arrivee', heure: '07:24', statut: 'Présent', minutesRetard: 0, distanceMetres: 38 }, 'arrivee'); },
        alertespt: () => { const t = DB.enseignants; const auj = todayISO(); DB.alertesPointage = [{ id: 'a1', enseignantId: t[2].id, date: auj, heure: '07:41', raison: 'Hors de l’établissement : à 2 315 m de l’école (zone de 100 m)', type: 'enseignant', methode: 'photo', latitude: 5.36, longitude: -3.95, photoChemin: 'x/y.jpg' }, { id: 'a2', enseignantId: t[3].id, auteurNom: ensFullName(t[3]), date: auj, heure: '08:05', raison: 'Position anormalement parfaite (0.4 m) : possible fausse position GPS', type: 'appel', methode: 'appel', classeId: DB.classes[3].id, latitude: 5.38, longitude: -3.92 }]; alertesRelues = Date.now(); renderView('dashboard'); basculerRubrique('alertes', true); document.getElementById('rub-alertes')?.closest('.db-rubriques')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        afficheqr: async () => { sb.rpc = async () => ({ data: 'ESSAI-AFFICHE', error: null }); await imprimerAfficheQrPointage(false); },
        rubrique: () => { ouvrirSection('titreSuiviEns'); const d = document.getElementById('rub-suivi'); console.error('RUBRIQUE ouverte=' + (d && !d.hidden) + ' titreInterneVisible=' + (d ? getComputedStyle(d.querySelector('.dbr-corps h2')).display : '-')); d?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); },
        relies: () => { document.querySelector('.seg[data-etat="relie"]').click(); },
      };
      if(GESTES[extra]){ await page.evaluate(`window.GESTES_EXTRA = { edtfictif: ${GESTES.edtfictif.toString()}, sfouvrir: ${GESTES.sfouvrir.toString()}, recusfictifs: ${GESTES.recusfictifs.toString()}, cantinepleine: ${GESTES.cantinepleine.toString()} }`); await page.evaluate(GESTES[extra]); await page.waitForTimeout(900); }
      if(extra === 'centre') await page.waitForTimeout(400);
      const mesure = await page.evaluate(() => { const t = document.querySelector('.topbar'); return t ? Math.round(t.getBoundingClientRect().height) : 0; });
      console.log(`${ecranBrut} ${largeur}px ${theme} : en-tête ${mesure}px`);
      // CONTRASTE=1 : textes trop pâles par rapport à leur fond (WCAG : 4,5 pour le texte courant, 3 pour le gros texte)
      if(process.env.CONTRASTE){
        const pb = await page.evaluate(() => {
          const rgba = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if(!m) return null; const v = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
          const lum = ([r, g, b]) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          const fondDe = el => { // superpose les fonds jusqu'à un fond opaque ; null si image ou dégradé (non mesurable)
            let couches = [];
            for(let x = el; x; x = x.parentElement){
              const cs = getComputedStyle(x);
              if(cs.backgroundImage && cs.backgroundImage !== 'none') return null;
              const c = rgba(cs.backgroundColor); if(c && c[3] > 0){ couches.push(c); if(c[3] >= 1) break; }
            }
            let res = [255, 255, 255];
            for(let i = couches.length - 1; i >= 0; i--){ const [r, g, b, a] = couches[i]; res = [r * a + res[0] * (1 - a), g * a + res[1] * (1 - a), b * a + res[2] * (1 - a)]; }
            return res;
          };
          const vus = new Set(), pbs = [];
          document.querySelectorAll('body *').forEach(el => {
            if(!['#text'].some(() => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))) return;
            if(el.closest('svg, [hidden], .modal-backdrop:not(.open), .sr-only, select, option, [disabled], [aria-hidden="true"]')) return;
            const cs = getComputedStyle(el); if(cs.display === 'none' || cs.visibility === 'hidden') return;
            const r = el.getBoundingClientRect(); if(!r.width || !r.height || r.bottom < 0) return;
            for(let x = el; x; x = x.parentElement){ if(Number(getComputedStyle(x).opacity) < 0.95) return; }
            const c = rgba(cs.color), f = fondDe(el); if(!c || !f) return;
            const coul = [c[0] * c[3] + f[0] * (1 - c[3]), c[1] * c[3] + f[1] * (1 - c[3]), c[2] * c[3] + f[2] * (1 - c[3])];
            const L1 = lum(coul), L2 = lum(f), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            const gros = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && Number(cs.fontWeight) >= 700);
            const seuil = gros ? 3 : 4.5;
            if(ratio < seuil){
              const nom = el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '') + ' « ' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) + ' »';
              const cle = el.tagName + [...el.classList].join('.') + cs.color + f.join(',');
              if(!vus.has(cle)){ vus.add(cle); pbs.push({ nom, ratio: Math.round(ratio * 100) / 100 }); }
            }
          });
          return pbs.sort((x, y) => x.ratio - y.ratio).slice(0, 12);
        });
        console.log(`CONTRASTE ${role} ${ecranBrut} ${theme} : ${pb.length ? pb.length + ' problème(s)' : 'OK'}` + pb.map(x => `\n   ${x.ratio} : ${x.nom}`).join(''));
        if(!process.env.AUDIT){ continue; }
      }
      // AUDIT=1 : mesure ce qui déborde (page plus large que l'écran, éléments qui sortent du cadre, textes coupés)
      if(process.env.AUDIT){
        const rapport = await page.evaluate(() => {
          const W = document.documentElement.clientWidth, sortis = [], coupes = [];
          const nomEl = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '')) + ' « ' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) + ' »';
          const defile = el => { for(let x = el.parentElement; x; x = x.parentElement){ const o = getComputedStyle(x).overflowX; if(o === 'auto' || o === 'scroll') return true; } return false; };
          const vus = new Set();
          document.querySelectorAll('body *').forEach(el => {
            const cs = getComputedStyle(el); if(cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
            if(el.closest('[hidden], .modal-backdrop:not(.open), .sidebar, svg, .skip-link, .sr-only, select, option, input, textarea, .ta-bandeau')) return; // champs (texte qui défile dedans) et bandeau défilant : voulus
            const r = el.getBoundingClientRect(); if(!r.width || !r.height) return;
            if((r.right > W + 1 || r.left < -1) && !defile(el) && ![...vus].some(v => v.contains(el))){ vus.add(el); sortis.push(nomEl(el) + ' +' + Math.round(Math.max(r.right - W, -r.left)) + 'px'); }
            if(['hidden', 'clip'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && !el.querySelector('img,canvas,video') && !el.matches('.enfant-carte, .app-hero') /* carte enfant, bandeau d'accueil : cercle décoratif (::after) volontairement rogné */) coupes.push(nomEl(el) + ' ' + (el.scrollWidth - el.clientWidth) + 'px');
          });
          return { page: document.documentElement.scrollWidth - W, sortis: sortis.slice(0, 8), coupes: coupes.slice(0, 8) };
        });
        const sep = '\n           ';
        if(rapport.page > 1 || rapport.sortis.length || rapport.coupes.length) console.log(`AUDIT ${role} ${ecranBrut} ${largeur}px : page +${rapport.page}px\n   sortis: ${rapport.sortis.join(sep)}\n   coupés: ${rapport.coupes.join(sep)}`);
        else console.log(`AUDIT ${role} ${ecranBrut} ${largeur}px : OK`);
        if(process.env.AUDIT === 'seul') continue;
      }
      await page.screenshot({ path: join(sortie, `${ecranBrut.replace('+', '-').replace(':', '-')}_${largeur}_${theme === 'light' ? 'clair' : 'sombre'}.png`), fullPage: !extra || ['profil', 'ongletbulletin', 'ongletpres'].includes(extra) });
      n++;
    }
    await contexte.close();
  }
}
await navigateur.close();
console.log(`${n} capture(s) dans captures/${nom}/`);
