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
const THEMES = (process.env.UNE_TAILLE ? ['light'] : ['light', 'dark']);
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

const navigateur = await chromium.launch({ channel: 'msedge', headless: true });
let n = 0;
for(const theme of THEMES){
  for(const [largeur, hauteur] of LARGEURS){
    const contexte = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, colorScheme: theme, deviceScaleFactor: 1, locale: 'fr-FR' });
    await contexte.addInitScript(t => { try{ localStorage.setItem('ecomaz_theme', t); }catch(_e){} }, theme);
    const page = await contexte.newPage();
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
      if(role === 'enseignant' && DB.enseignants[0]){ session.enseignantId = DB.enseignants[0].id; DB.enseignants[0].classesAssignees = DB.enseignants[0].classesAssignees && DB.enseignants[0].classesAssignees.length ? DB.enseignants[0].classesAssignees : [DB.classes[0].id]; }
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
      await page.evaluate(([v, o, r]) => { closeModal && closeModal();
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
        repondre: () => { const f = document.querySelector('.question-appel'); f.querySelector('input[value=F]').click(); f.querySelector('#nomAppel').value = 'NAHI'; apercuAppellation(); f.requestSubmit(); },
        approuver1: () => { document.querySelector('.dem-carte .btn.sm').click(); },
        profil: () => { ui.eleveProfileId = DB.eleves[0].id; renderView('eleves'); window.scrollTo(0, 0); },
        ongletbulletin: () => { ui.eleveProfileId = DB.eleves[0].id; ui.filters.profilOnglet = 'bulletin'; renderView('eleves'); window.scrollTo(0, 0); },
        ongletpres: () => { ui.eleveProfileId = DB.eleves[0].id; ui.filters.profilOnglet = 'presences'; renderView('eleves'); window.scrollTo(0, 0); },
        relies: () => { document.querySelector('.seg[data-etat="relie"]').click(); },
      };
      if(GESTES[extra]){ await page.evaluate(GESTES[extra]); await page.waitForTimeout(900); }
      if(extra === 'centre') await page.waitForTimeout(400);
      const mesure = await page.evaluate(() => { const t = document.querySelector('.topbar'); return t ? Math.round(t.getBoundingClientRect().height) : 0; });
      console.log(`${ecranBrut} ${largeur}px ${theme} : en-tête ${mesure}px`);
      await page.screenshot({ path: join(sortie, `${ecranBrut.replace('+', '-').replace(':', '-')}_${largeur}_${theme === 'light' ? 'clair' : 'sombre'}.png`), fullPage: !extra || ['profil', 'ongletbulletin', 'ongletpres'].includes(extra) });
      n++;
    }
    await contexte.close();
  }
}
await navigateur.close();
console.log(`${n} capture(s) dans captures/${nom}/`);
