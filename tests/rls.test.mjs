/* =========================================================================
   EcoMaZ — Tests automatisés (sécurité / RLS / fonctions critiques)
   ========================================================================= */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* Charge les identifiants de test depuis tests/.env.test (jamais commité —
   voir tests/.env.test.example pour le modèle à remplir). */
function chargerEnv(){
  const chemin = join(__dirname, '.env.test');
  if(!existsSync(chemin)){
    console.error(`Fichier manquant : ${chemin}\nCopie tests/.env.test.example vers tests/.env.test et remplis les valeurs.`);
    process.exit(1);
  }
  const env = {};
  for(const ligne of readFileSync(chemin, 'utf8').split('\n')){
    const l = ligne.trim();
    if(!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if(i === -1) continue;
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return env;
}
const ENV = chargerEnv();
const URL_BASE = ENV.SUPABASE_URL;
const ANON_KEY = ENV.SUPABASE_ANON_KEY;

let nbOk = 0, nbEchec = 0;
function verifier(nom, condition, detail){
  if(condition){ nbOk++; console.log(`  ✅ ${nom}`); }
  else { nbEchec++; console.log(`  ❌ ${nom}${detail ? ' — ' + detail : ''}`); }
}
function section(titre){ console.log(`\n${titre}`); }

async function connecter(email, password){
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { ok: res.ok, accessToken: data.access_token, erreur: data.error_description || data.msg };
}
async function requete(accessToken, chemin, options = {}){
  const res = await fetch(`${URL_BASE}${chemin}`, {
    ...options,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let data = null;
  try{ data = await res.json(); }catch(_e){ /* réponse vide, ok */ }
  return { status: res.status, ok: res.ok, data };
}

(async () => {
  console.log('EcoMaZ — Tests automatisés\n' + '='.repeat(40));

  section('1. Authentification');
  const bonMdp = await connecter(ENV.ENSEIGNANT_EMAIL, ENV.ENSEIGNANT_PASSWORD);
  verifier('Connexion enseignant avec le bon mot de passe réussit', bonMdp.ok);
  const mauvaisMdp = await connecter(ENV.ENSEIGNANT_EMAIL, 'mot-de-passe-totalement-faux-123');
  verifier('Connexion avec un mauvais mot de passe échoue', !mauvaisMdp.ok);

  const tokenEnseignant = bonMdp.accessToken;
  const tokenSecretariat = (await connecter(ENV.SECRETARIAT_EMAIL, ENV.SECRETARIAT_PASSWORD)).accessToken;
  const tokenDeveloppeur = (await connecter(ENV.DEVELOPPEUR_EMAIL, ENV.DEVELOPPEUR_PASSWORD)).accessToken;

  section('2. RLS — table "enseignants" (doit être fermée à un compte enseignant)');
  const ensDirect = await requete(tokenEnseignant, `/rest/v1/enseignants?select=*&limit=1`);
  verifier('Un enseignant ne peut PAS lire la table enseignants directement', Array.isArray(ensDirect.data) && ensDirect.data.length === 0,
    `reçu ${JSON.stringify(ensDirect.data)}`);

  section('3. RLS — vue "enseignants_lecture" (colonnes sensibles masquées pour un enseignant)');
  const ensVue = await requete(tokenEnseignant, `/rest/v1/enseignants_lecture?select=*&limit=1`);
  if(Array.isArray(ensVue.data) && ensVue.data.length > 0){
    const row = ensVue.data[0];
    verifier('salaire_mensuel masqué (null) pour un enseignant', row.salaire_mensuel === null, `reçu ${row.salaire_mensuel}`);
    verifier('telephone masqué (null) pour un enseignant', row.telephone === null, `reçu ${row.telephone}`);
    verifier('qr_token masqué (null) pour un enseignant', row.qr_token === null, `reçu ${row.qr_token}`);
  } else {
    console.log('  ⚠️  Aucun enseignant en base pour cette école — impossible de vérifier le masquage (pas un échec, juste rien à tester)');
  }
  const ensVueAdmin = await requete(tokenSecretariat, `/rest/v1/enseignants_lecture?select=*&limit=1`);
  if(Array.isArray(ensVueAdmin.data) && ensVueAdmin.data.length > 0){
    verifier('Le secrétariat voit les vraies valeurs (pas masquées)', ensVueAdmin.data[0].salaire_mensuel !== null || ensVueAdmin.data[0].salaire_mensuel === 0);
  }

  section('3bis. RLS — comptabilité : le secrétariat ne lit ni salaires, ni dépenses, ni personnel, ni journal');
  for(const table of ['paiements_salaires','depenses','personnel_autre','journal_compta','budgets_comptables']){
    const r = await requete(tokenSecretariat, `/rest/v1/${table}?select=id&limit=1`);
    verifier(`Le secrétariat ne lit rien dans ${table}`, Array.isArray(r.data) && r.data.length === 0, `reçu ${JSON.stringify(r.data)?.slice(0,80)}`);
  }
  const salSep = await requete(tokenSecretariat, `/rest/v1/salaires_enseignants?select=enseignant_id&limit=1`);
  verifier('Le secrétariat ne lit rien dans salaires_enseignants', Array.isArray(salSep.data) && salSep.data.length === 0, `reçu ${JSON.stringify(salSep.data)?.slice(0,80)}`);
  const salBase = await requete(tokenSecretariat, `/rest/v1/enseignants?select=id&salaire_mensuel=neq.0&limit=1`);
  verifier('Aucun salaire lisible dans la table enseignants', salBase.ok && Array.isArray(salBase.data) && salBase.data.length === 0, `reçu ${JSON.stringify(salBase.data)?.slice(0,80)}`);
  const ecritDepense = await requete(tokenSecretariat, `/rest/v1/depenses`, { method:'POST', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', libelle:'test', montant:1, date:'2026-01-01' }) });
  verifier("Le secrétariat ne peut pas écrire une dépense", !ecritDepense.ok, `statut ${ecritDepense.status}`);
  const scolSec = await requete(tokenSecretariat, `/rest/v1/paiements_scolarite?select=id&limit=1`);
  verifier('Le secrétariat garde l accès aux paiements de scolarité (requête acceptée)', scolSec.ok);

  section('3ter. RLS — présences : un parent lit SEULEMENT celles de ses enfants, sans pouvoir écrire');
  if(ENV.PARENT_EMAIL){
    const tokenParent = (await connecter(ENV.PARENT_EMAIL, ENV.PARENT_PASSWORD)).accessToken;
    const liens = await requete(tokenParent, `/rest/v1/parents_eleves?select=eleve_id`);
    const mesEnfants = new Set((liens.data || []).map(l => l.eleve_id));
    const pres = await requete(tokenParent, `/rest/v1/presences_eleves?select=eleve_id&limit=500`);
    verifier('Le parent ne lit que des présences de SES enfants', Array.isArray(pres.data) && pres.data.every(p => mesEnfants.has(p.eleve_id)), `reçu ${JSON.stringify(pres.data)?.slice(0,80)}`);
    const ecrit = await requete(tokenParent, `/rest/v1/presences_eleves`, { method:'POST', body: JSON.stringify({ date:'2026-01-01', statut:'Présent', eleve_id:[...mesEnfants][0] || null }) });
    verifier('Le parent ne peut pas écrire une présence', !ecrit.ok, `statut ${ecrit.status}`);
  } else {
    console.log('  ⚠️  PARENT_EMAIL absent de tests/.env.test — test ignoré');
  }

  section('3quater. Applaudissements : réservés aux parents, personne ne voit qui a applaudi');
  const appStaff = await requete(tokenSecretariat, `/rest/v1/rpc/applaudir_honneur`, { method:'POST', body: JSON.stringify({ p_categorie:'eleve', p_nom:'x' }) });
  verifier('Le personnel ne peut pas applaudir', !appStaff.ok, `statut ${appStaff.status}`);
  const appTable = await requete(tokenSecretariat, `/rest/v1/applaudissements_honneur?select=*`);
  verifier('La table des applaudissements n est pas lisible directement', Array.isArray(appTable.data) && appTable.data.length === 0, `reçu ${JSON.stringify(appTable.data)?.slice(0,60)}`);

  section('4. RLS — écoles (isolation développeur)');
  const ecolesDev = await requete(tokenDeveloppeur, `/rest/v1/ecoles?select=id,nom_ecole`);
  verifier('Le développeur voit la liste des écoles', Array.isArray(ecolesDev.data) && ecolesDev.data.length > 0);
  const ecolesEns = await requete(tokenEnseignant, `/rest/v1/ecoles?select=id,nom_ecole`);
  verifier('Un enseignant ne voit que SA propre école', Array.isArray(ecolesEns.data) && ecolesEns.data.length === 1,
    `reçu ${ecolesEns.data?.length} école(s)`);

  section('5. Edge Function — enregistrer-pointage (doit refuser un enseignant)');
  const pointageRes = await fetch(`${URL_BASE}/functions/v1/enregistrer-pointage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenEnseignant}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enseignantId: '00000000-0000-0000-0000-000000000000', action: 'arrivee' }),
  });
  verifier('enregistrer-pointage refuse un compte enseignant', pointageRes.status === 400);

  section('6. Edge Function — notifier-absence-eleve (doit refuser un élève inexistant)');
  const notifRes = await fetch(`${URL_BASE}/functions/v1/notifier-absence-eleve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenEnseignant}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ eleveId: '00000000-0000-0000-0000-000000000000', date: '2026-01-01', motif: 'test' }),
  });
  verifier('notifier-absence-eleve refuse un élève inexistant', notifRes.status === 400);

  section('7. Paiement en ligne — clés protégées, aucune fausse confirmation acceptée');
  const cfgSec = await requete(tokenSecretariat, `/rest/v1/paiement_en_ligne_config?select=identifiants&limit=1`);
  verifier('Le secrétariat ne lit pas les clés PayDunya', Array.isArray(cfgSec.data) && cfgSec.data.length === 0, `reçu ${JSON.stringify(cfgSec.data)?.slice(0,80)}`);
  const cfgDev = await requete(tokenDeveloppeur, `/rest/v1/paiement_en_ligne_config?select=identifiants&limit=1`);
  verifier('Le développeur ne lit pas non plus les clés PayDunya', Array.isArray(cfgDev.data) && cfgDev.data.length === 0, `reçu ${JSON.stringify(cfgDev.data)?.slice(0,80)}`);
  const vueCfg = await requete(tokenSecretariat, `/rest/v1/paiement_en_ligne_config_lecture?select=actif`);
  verifier('La vue sans clés reste lisible par le personnel', vueCfg.ok);
  const fauxLien = await requete(tokenSecretariat, `/rest/v1/paiements_en_ligne`, { method:'POST', body: JSON.stringify({ eleve_id:'00000000-0000-4000-8000-000000000001', tranche:'x', montant:1, statut:'reussi' }) });
  verifier('Personne ne crée une tentative de paiement depuis le navigateur', !fauxLien.ok, `statut ${fauxLien.status}`);
  const corpsFaux = new URLSearchParams({ 'data[custom_data][ecole_id]':'00000000-0000-4000-8000-000000000001', 'data[invoice][token]':'faux', 'data[status]':'completed', 'data[hash]':'0'.repeat(128) });
  const webhookFaux = await fetch(`${URL_BASE}/functions/v1/webhook-paiement-en-ligne`, { method:'POST', body: corpsFaux });
  const webhookRep = await webhookFaux.json().catch(() => ({}));
  verifier('Le webhook rejette une fausse confirmation de paiement', webhookRep.ok === false, JSON.stringify(webhookRep).slice(0,80));

  section('7bis. Objets perdus — chacun ne voit que ce qui le concerne');
  const objEns = await requete(tokenEnseignant, `/rest/v1/objets_perdus?select=id&limit=1`);
  verifier('Un enseignant ne lit pas les objets perdus', Array.isArray(objEns.data) && objEns.data.length === 0, `reçu ${JSON.stringify(objEns.data)?.slice(0,80)}`);
  const objSec = await requete(tokenSecretariat, `/rest/v1/objets_perdus?select=id&limit=1`);
  verifier('Le secrétariat peut consulter les objets perdus (requête acceptée)', objSec.ok);
  const objFauxSec = await requete(tokenSecretariat, `/rest/v1/objets_perdus`, { method:'POST', body: JSON.stringify({ eleve_id:'00000000-0000-4000-8000-000000000001', objet:'essai refusé' }) });
  verifier('Le secrétariat ne crée pas de signalement à la place d un parent', !objFauxSec.ok, `statut ${objFauxSec.status}`);
  if(ENV.PARENT_EMAIL){
    const tokenParent2 = (await connecter(ENV.PARENT_EMAIL, ENV.PARENT_PASSWORD)).accessToken;
    const objAutre = await requete(tokenParent2, `/rest/v1/objets_perdus`, { method:'POST', body: JSON.stringify({ eleve_id:'00000000-0000-4000-8000-000000000001', objet:'essai refusé' }) });
    verifier('Un parent ne signale pas pour un enfant qui n est pas le sien', !objAutre.ok, `statut ${objAutre.status}`);
  }

  section('7ter. Notifications push — abonnements privés, envoi réservé au personnel');
  const aboSec = await requete(tokenSecretariat, `/rest/v1/push_abonnements?select=id&limit=5`);
  verifier('Le secrétariat ne voit pas les téléphones des parents', Array.isArray(aboSec.data) && aboSec.data.length === 0, `reçu ${JSON.stringify(aboSec.data)?.slice(0,80)}`);
  const aboAnon = await requete(ANON_KEY, `/rest/v1/rpc/enregistrer_abonnement_push`, { method:'POST', body: JSON.stringify({ p_endpoint:'https://exemple.test/x', p_p256dh:'x', p_auth:'x', p_appareil:'' }) });
  verifier('Un visiteur non connecté ne peut pas abonner un téléphone', !aboAnon.ok, `statut ${aboAnon.status}`);
  const pushEns = await fetch(`${URL_BASE}/functions/v1/notifier-parents`, { method:'POST', headers:{ Authorization:`Bearer ${tokenEnseignant}`, 'Content-Type':'application/json' }, body: JSON.stringify({ eleveIds:['00000000-0000-4000-8000-000000000001'], texte:'x' }) });
  verifier('Un enseignant ne peut pas envoyer de notification push aux parents', pushEns.status === 400);

  section('7quater. Absences signalées par les parents, arrivée d un parent (portier)');
  const absSec = await requete(tokenSecretariat, `/rest/v1/absences_signalees?select=id&limit=1`);
  verifier('Le secrétariat peut consulter les absences signalées (requête acceptée)', absSec.ok);
  const absFaux = await requete(tokenSecretariat, `/rest/v1/absences_signalees`, { method:'POST', body: JSON.stringify({ eleve_id:'00000000-0000-4000-8000-000000000001', date_debut:'2030-01-01', date_fin:'2030-01-01', motif:'Maladie' }) });
  verifier('Le secrétariat ne signale pas une absence à la place d un parent', !absFaux.ok, `statut ${absFaux.status}`);
  const arriveeSec = await fetch(`${URL_BASE}/functions/v1/notifier-arrivee-parent`, { method:'POST', headers:{ Authorization:`Bearer ${tokenSecretariat}`, 'Content-Type':'application/json' }, body: JSON.stringify({ eleveId:'00000000-0000-4000-8000-000000000001' }) });
  verifier('Seul le portier peut déclencher la notification « parent à la porte »', arriveeSec.status === 400);

  section('7quinquies. Santé des écoles — réservée au compte développeur');
  const santeSec = await requete(tokenSecretariat, `/rest/v1/rpc/sante_ecoles`, { method:'POST', body:'{}' });
  verifier('Le secrétariat ne voit pas la santé des écoles', !santeSec.ok, `statut ${santeSec.status}`);
  const santeDev = await requete(tokenDeveloppeur, `/rest/v1/rpc/sante_ecoles`, { method:'POST', body:'{}' });
  verifier('Le développeur obtient uniquement des chiffres', santeDev.ok && Array.isArray(santeDev.data) && santeDev.data.every(r => !('nom' in r) && !('prenom' in r)));

  section('7sexies. Notifications vers l école — aucun envoi sans vrai signalement');
  const notifFaux = await fetch(`${URL_BASE}/functions/v1/notifier-personnel`, { method:'POST', headers:{ Authorization:`Bearer ${tokenSecretariat}`, 'Content-Type':'application/json' }, body: JSON.stringify({ type:'absence' }) });
  verifier('Pas de notification « absence » sans signalement récent de l appelant', notifFaux.status === 400);
  const notifType = await fetch(`${URL_BASE}/functions/v1/notifier-personnel`, { method:'POST', headers:{ Authorization:`Bearer ${tokenSecretariat}`, 'Content-Type':'application/json' }, body: JSON.stringify({ type:'nimporte' }) });
  verifier('Type de notification inconnu refusé', notifType.status === 400);

  section('7septies. Enrôlement — recherche d élèves protégée, enseignant limité à ses classes');
  const ecoleSec = (await requete(tokenSecretariat, `/rest/v1/profiles?select=ecole_id&limit=1`)).data?.[0]?.ecole_id;
  const rechAnon = await requete(ANON_KEY, `/rest/v1/rpc/rechercher_eleves_demande`, { method:'POST', body: JSON.stringify({ p_ecole: ecoleSec, p_texte:'kon' }) });
  verifier('Sans connexion, impossible de chercher des élèves', !rechAnon.ok || (Array.isArray(rechAnon.data) && rechAnon.data.length === 0), `statut ${rechAnon.status}`);
  const rechCourt = await requete(tokenSecretariat, `/rest/v1/rpc/rechercher_eleves_demande`, { method:'POST', body: JSON.stringify({ p_ecole: ecoleSec, p_texte:'ko' }) });
  verifier('Moins de 3 lettres : aucune réponse', rechCourt.ok && Array.isArray(rechCourt.data) && rechCourt.data.length === 0);
  const rechChamps = await requete(tokenSecretariat, `/rest/v1/rpc/rechercher_eleves_demande`, { method:'POST', body: JSON.stringify({ p_ecole: ecoleSec, p_texte:'aaa' }) });
  verifier('La recherche ne renvoie que prénom, nom et classe', rechChamps.ok && (rechChamps.data||[]).every(r => Object.keys(r).sort().join(',') === 'classe,id,nom,prenom'));
  const elevesEns = await requete(tokenEnseignant, `/rest/v1/eleves?select=id&limit=1`);
  verifier('Un compte enseignant sans classe ne voit aucun élève', Array.isArray(elevesEns.data) && elevesEns.data.length === 0, `reçu ${JSON.stringify(elevesEns.data)?.slice(0,60)}`);

  section('7octies. Bulletins — rien de visible sans publication par l école');
  const notesAnon = await requete(ANON_KEY, `/rest/v1/notes?select=id&limit=1`);
  verifier('Sans connexion, aucune note lisible', !notesAnon.ok || (Array.isArray(notesAnon.data) && notesAnon.data.length === 0));

  const errSec = await requete(tokenSecretariat, `/rest/v1/rpc/erreurs_recentes`, { method:'POST', body:'{}' });
  verifier('Les erreurs techniques sont réservées au développeur', !errSec.ok, `statut ${errSec.status}`);

  section('7novies. Fonctions du 13/10 — devoirs, sécurité & santé, demandes des familles (identifiants fictifs : rien n est créé)');
  const FAUX = '00000000-0000-4000-8000-000000000001';
  const devoirEns = await requete(tokenEnseignant, `/rest/v1/devoirs`, { method:'POST', body: JSON.stringify({ classe_id:'classe-inexistante', travail:'essai refusé', pour_le:'2030-01-01' }) });
  verifier('Un enseignant ne note pas de devoir pour une classe qui n est pas la sienne', !devoirEns.ok, `statut ${devoirEns.status}`);
  const santeEns = await requete(tokenEnseignant, `/rest/v1/sante_eleves?select=eleve_id&limit=1`);
  verifier('Un enseignant sans classe ne voit aucune information de santé', Array.isArray(santeEns.data) && santeEns.data.length === 0);
  const persEns = await requete(tokenEnseignant, `/rest/v1/personnes_autorisees?select=id&limit=1`);
  verifier('Un enseignant sans classe ne voit aucune personne autorisée', Array.isArray(persEns.data) && persEns.data.length === 0);
  const preEns = await requete(tokenEnseignant, `/rest/v1/preinscriptions?select=id&limit=1`);
  verifier('Un enseignant ne lit pas les pré-inscriptions', Array.isArray(preEns.data) && preEns.data.length === 0);
  const preSec = await requete(tokenSecretariat, `/rest/v1/preinscriptions?select=id&limit=1`);
  verifier('Le secrétariat consulte les pré-inscriptions (requête acceptée)', preSec.ok);
  const portierAnon = await requete(ANON_KEY, `/rest/v1/rpc/personnes_autorisees_portier`, { method:'POST', body: JSON.stringify({ p_eleve: FAUX }) });
  verifier('Sans connexion, impossible de lire les personnes autorisées', !portierAnon.ok);
  const portierEns = await requete(tokenEnseignant, `/rest/v1/rpc/personnes_autorisees_portier`, { method:'POST', body: JSON.stringify({ p_eleve: FAUX }) });
  verifier('Un enseignant n utilise pas la fonction réservée au portier', !portierEns.ok);
  const preFaux = await requete(ANON_KEY, `/rest/v1/rpc/preinscrire`, { method:'POST', body: JSON.stringify({ p_ecole: FAUX, p_enfant_prenom:'A', p_enfant_nom:'B', p_date_naissance:null, p_sexe:'', p_classe:'', p_parent_nom:'Essai', p_parent_tel:'0700000000', p_message:'' }) });
  verifier('Pré-inscription refusée pour une école inexistante', !preFaux.ok, `statut ${preFaux.status}`);
  const infoFaux = await requete(ANON_KEY, `/rest/v1/rpc/ecole_preinscription`, { method:'POST', body: JSON.stringify({ p_ecole: FAUX }) });
  verifier('Aucune information pour une école inexistante', infoFaux.ok && Array.isArray(infoFaux.data) && infoFaux.data.length === 0);
  if(ENV.PARENT_EMAIL){
    const tokenParent3 = (await connecter(ENV.PARENT_EMAIL, ENV.PARENT_PASSWORD)).accessToken;
    const essais = [
      ['personnes_autorisees', { eleve_id: FAUX, nom:'Essai refusé' }],
      ['sante_eleves', { eleve_id: FAUX, allergies:'essai' }],
      ['corrections_fiches', { eleve_id: FAUX, champs:{ parent_nom:'Essai' } }],
      ['demandes_documents', { eleve_id: FAUX, type:'certificat_scolarite' }],
      ['reponses_agenda', { evenement_id: FAUX, eleve_id: FAUX, reponse:true }],
      ['devoirs', { classe_id:'classe-inexistante', travail:'essai refusé', pour_le:'2030-01-01' }],
      ['menus_cantine', { date:'2030-01-01', repas:'essai' }],
    ];
    for(const [table, corps] of essais){
      const r = await requete(tokenParent3, `/rest/v1/${table}`, { method:'POST', body: JSON.stringify(corps) });
      verifier(`Un parent n écrit pas dans ${table} pour un enfant / une classe qui n est pas la sienne`, !r.ok, `statut ${r.status}`);
    }
  }

  const demoSec = await requete(tokenSecretariat, `/rest/v1/rpc/preparer_ecole_demo`, { method:'POST', body: JSON.stringify({ p_ecole: FAUX }) });
  verifier('Le secrétariat ne peut pas transformer une école en école démo', !demoSec.ok, `statut ${demoSec.status}`);
  const remplirSec = await requete(tokenSecretariat, `/rest/v1/rpc/remplir_ecole_demo`, { method:'POST', body: JSON.stringify({ p_ecole: FAUX }) });
  verifier('Le secrétariat ne peut pas remplir une école de données fictives', !remplirSec.ok, `statut ${remplirSec.status}`);

  section('7decies. Durcissement du 13/10 — listes protégées, écran du hall par identifiant');
  if(ENV.PARENT_EMAIL){
    const tokenParent4 = (await connecter(ENV.PARENT_EMAIL, ENV.PARENT_PASSWORD)).accessToken;
    const listeParent = await requete(tokenParent4, `/rest/v1/eleves_portier_lecture?select=id`);
    verifier('Un parent ne voit pas la liste des élèves de l école', Array.isArray(listeParent.data) && listeParent.data.length === 0, `reçu ${JSON.stringify(listeParent.data)?.slice(0,60)}`);
  }
  const hallFaux = await requete(ANON_KEY, `/rest/v1/rpc/affichage_ecole`, { method:'POST', body: JSON.stringify({ p_ecole: FAUX }) });
  verifier('Écran du hall : rien pour une école inconnue', hallFaux.ok && hallFaux.data === null);
  for(const vue of ['tableau_honneur_public','actualites_affichage_public','ecoles_vitrine']){
    const r = await requete(ANON_KEY, `/rest/v1/${vue}?select=*&limit=1`);
    verifier(`Sans connexion, impossible de lister ${vue} (toutes écoles)`, !r.ok || (Array.isArray(r.data) && r.data.length === 0));
  }

  section('7undecies. Cahier d appel et Camps de base');
  const evalEns = await requete(tokenEnseignant, `/rest/v1/evaluations`, { method:'POST', body: JSON.stringify({ classe_id:'classe-inexistante', matiere:'Français', trimestre:'Trimestre 1', type:'Devoir' }) });
  verifier('Un enseignant ne crée pas d évaluation pour une classe qui n est pas la sienne', !evalEns.ok, `statut ${evalEns.status}`);
  if(ENV.PARENT_EMAIL){
    const tokenParent5 = (await connecter(ENV.PARENT_EMAIL, ENV.PARENT_PASSWORD)).accessToken;
    const evalPar = await requete(tokenParent5, `/rest/v1/evaluations?select=id&limit=1`);
    verifier('Un parent ne voit pas les évaluations (Camps de base)', Array.isArray(evalPar.data) && evalPar.data.length === 0);
    const notePar = await requete(tokenParent5, `/rest/v1/notes`, { method:'POST', body: JSON.stringify({ eleve_id: FAUX, matiere:'Français', note: 20, note_sur: 20, trimestre:'Trimestre 1', type:'Devoir' }) });
    verifier('Un parent ne peut pas écrire de note', !notePar.ok, `statut ${notePar.status}`);
  }

  section('7duodecies. Bulletin officiel — coefficients et résultats protégés');
  const coefSec = await requete(tokenSecretariat, `/rest/v1/coefficients_matieres`, { method:'POST', body: JSON.stringify({ cycle:'Primaire', matiere:'Essai', coefficient: 2 }) });
  verifier('Le secrétariat ne modifie pas les coefficients (réservé à la direction)', !coefSec.ok, `statut ${coefSec.status}`);
  const resSec = await requete(tokenSecretariat, `/rest/v1/bulletins_resultats`, { method:'POST', body: JSON.stringify({ eleve_id: FAUX, trimestre:'Trimestre 1', moyenne: 20 }) });
  verifier('Le secrétariat ne fabrique pas de résultat de bulletin', !resSec.ok, `statut ${resSec.status}`);
  if(ENV.PARENT_EMAIL){
    const tokenParent6 = (await connecter(ENV.PARENT_EMAIL, ENV.PARENT_PASSWORD)).accessToken;
    const coefPar = await requete(tokenParent6, `/rest/v1/coefficients_matieres?select=matiere&limit=1`);
    verifier('Un parent ne lit pas la table des coefficients', Array.isArray(coefPar.data) && coefPar.data.length === 0);
  }

  section('7terdecies. Double vérification appliquée par la base');
  const dvSec = await requete(tokenSecretariat, `/rest/v1/rpc/double_verification_ok`, { method:'POST', body:'{}' });
  verifier('Compte sans double vérification : accès normal (aucun blocage involontaire)', dvSec.ok && dvSec.data === true, JSON.stringify(dvSec.data));
  const dvAnon = await requete(ANON_KEY, `/rest/v1/rpc/double_verification_ok`, { method:'POST', body:'{}' });
  verifier('La fonction de contrôle n est pas appelable sans connexion', !dvAnon.ok);

  section('8. Visiteur non connecté — ne lit que les affichages publics prévus');
  for(const table of ['eleves','enseignants_lecture','profiles','paiements_scolarite','messages','parents_eleves','presences_eleves','eleves_portier_lecture','objets_perdus','push_abonnements','absences_signalees','evenements_agenda','devoirs','personnes_autorisees','sante_eleves','reponses_agenda','corrections_fiches','menus_cantine','preinscriptions','demandes_documents','evaluations','coefficients_matieres','bulletins_resultats']){
    const r = await requete(ANON_KEY, `/rest/v1/${table}?select=*&limit=1`);
    verifier(`Sans connexion, rien à lire dans ${table}`, !r.ok || (Array.isArray(r.data) && r.data.length === 0), `reçu ${JSON.stringify(r.data)?.slice(0,80)}`);
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Résultat : ${nbOk} réussi(s), ${nbEchec} échoué(s)`);
  process.exit(nbEchec > 0 ? 1 : 0);
})();
