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

  section('8. Visiteur non connecté — ne lit que les affichages publics prévus');
  for(const table of ['eleves','enseignants_lecture','profiles','paiements_scolarite','messages','parents_eleves','presences_eleves','eleves_portier_lecture']){
    const r = await requete(ANON_KEY, `/rest/v1/${table}?select=*&limit=1`);
    verifier(`Sans connexion, rien à lire dans ${table}`, !r.ok || (Array.isArray(r.data) && r.data.length === 0), `reçu ${JSON.stringify(r.data)?.slice(0,80)}`);
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Résultat : ${nbOk} réussi(s), ${nbEchec} échoué(s)`);
  process.exit(nbEchec > 0 ? 1 : 0);
})();
