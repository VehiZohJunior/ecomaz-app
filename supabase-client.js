/* =========================================================================
   EcoMaZ — Couche de connexion à la base de données Supabase
   Remplace le stockage local (localStorage) par une vraie base distante,
   partagée entre les postes, avec authentification réelle et sécurité
   appliquée au niveau de la base (RLS), pas seulement dans l'interface.
   ========================================================================= */

const SUPABASE_URL = 'https://hvqtsvpkxffseclsfoun.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nKIXMo3r5_XIhi78hcgXyw_zvdYGJQY';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------------------------------------------------------------------
   Conversion générique camelCase (JS) <-> snake_case (PostgreSQL)
   --------------------------------------------------------------------- */
function camelToSnake(s){ return s.replace(/[A-Z]/g, m => '_' + m.toLowerCase()); }
function snakeToCamel(s){ return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()); }
function rowToCamel(row){
  if(!row) return row;
  const out = {};
  for(const k in row) out[snakeToCamel(k)] = row[k];
  return out;
}
function rowsToCamel(rows){ return (rows||[]).map(rowToCamel); }
function objToSnake(obj){
  const out = {};
  for(const k in obj) out[camelToSnake(k)] = obj[k];
  return out;
}

/* ---------------------------------------------------------------------
   Session courante (utilisateur connecté)
   --------------------------------------------------------------------- */
const session = { userId:null, ecoleId:null, role:null, nomComplet:'', enseignantId:null };

// "getSession()" lit la session déjà en mémoire/localStorage, sans appel
// réseau (sauf si le jeton doit être rafraîchi) — contrairement à
// "getUser()", qui revalide toujours côté serveur. Nécessaire pour que
// l'appli puisse s'ouvrir hors ligne avec une session déjà active.
async function chargerProfilCourant(){
  const { data: { session: authSession } } = await sb.auth.getSession();
  const user = authSession?.user;
  if(!user) return null;
  try{
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if(error) throw error;
    if(!data) return null;
    session.userId = user.id;
    session.ecoleId = data.ecole_id;
    session.role = data.role;
    session.nomComplet = data.nom_complet || '';
    session.enseignantId = data.enseignant_id || null;
    try{ localStorage.setItem('ecomaz_profil_cache', JSON.stringify(data)); }catch(_e){}
    return data;
  }catch(e){
    if(!erreurReseau(e)) return null;
    // Hors ligne : on retombe sur le dernier profil connu (mis en cache
    // localement à la dernière connexion réussie), pour permettre à
    // l'appli de s'ouvrir quand même.
    try{
      const cache = JSON.parse(localStorage.getItem('ecomaz_profil_cache') || 'null');
      if(cache && cache.id === user.id){
        session.userId = user.id;
        session.ecoleId = cache.ecole_id;
        session.role = cache.role;
        session.nomComplet = cache.nom_complet || '';
        session.enseignantId = cache.enseignant_id || null;
        return cache;
      }
    }catch(_e2){ /* pas de cache exploitable */ }
    return null;
  }
}

async function connexion(email, motDePasse){
  const { data, error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
  if(error) return { ok:false, message: traduireErreurAuth(error) };
  const profil = await chargerProfilCourant();
  if(!profil) return { ok:false, message: "Ce compte n'est associé à aucune école. Contactez votre administrateur." };
  return { ok:true, profil };
}
async function deconnexion(){
  await sb.auth.signOut();
  session.userId = null; session.ecoleId = null; session.role = null; session.nomComplet = '';
}
function traduireErreurAuth(error){
  if(error.message && error.message.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.';
  if(error.message && error.message.includes('rate limit')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  return error.message || 'Erreur de connexion.';
}

async function demanderReinitialisationMotDePasse(email){
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if(error) return { ok:false, message: traduireErreurAuth(error) };
  return { ok:true };
}
async function definirNouveauMotDePasse(nouveauMotDePasse){
  const { error } = await sb.auth.updateUser({ password: nouveauMotDePasse });
  if(error) return { ok:false, message: traduireErreurAuth(error) };
  return { ok:true };
}

/* ---------------------------------------------------------------------
   SMS réels (via la fonction Edge "envoyer-sms" — voir supabase/functions/)
   --------------------------------------------------------------------- */
function normaliserTelephoneCI(tel){
  let digits = (tel || '').replace(/\D/g, '');
  if(digits.startsWith('225')) digits = digits.slice(3);
  return '+225' + digits;
}
async function envoyerSmsReel(telephone, message){
  try{
    const { data, error } = await sb.functions.invoke('envoyer-sms', {
      body: { to: normaliserTelephoneCI(telephone), message },
    });
    if(error) throw error;
    return { ok: data?.ok !== false, data };
  }catch(e){
    console.warn('Échec envoi SMS réel (notification interne conservée) :', e.message);
    return { ok:false, error: e.message };
  }
}

/* ---------------------------------------------------------------------
   MODE HORS LIGNE — cache local (IndexedDB) + file d'attente
   ---------------------------------------------------------------------
   L'application doit pouvoir s'ouvrir ET être utilisée (lecture ET
   écriture) sans connexion : les données affichées sont alors les
   dernières connues, et toute modification est mise en file d'attente
   puis rejouée automatiquement dès que la connexion revient.

   Limite assumée, en toute transparence : en cas de modification
   CONFLICTUELLE (la même fiche modifiée sur deux appareils différents
   pendant qu'ils étaient tous les deux hors ligne), c'est la dernière
   synchronisation reçue par le serveur qui l'emporte — pas de fusion
   intelligente. Pour l'usage réel de cette appli (peu de comptes par
   école, actions rarement simultanées sur exactement la même fiche),
   ce compromis est raisonnable ; ce n'est pas une garantie absolue
   d'intégrité en cas d'usage multi-appareils vraiment simultané.
   --------------------------------------------------------------------- */
const IDB_NOM = 'ecomaz-offline';
const IDB_VERSION = 1;
let __idbPromise = null;
function ouvrirIDB(){
  if(__idbPromise) return __idbPromise;
  __idbPromise = new Promise((resolve, reject) => {
    if(!window.indexedDB){ reject(new Error('IndexedDB indisponible')); return; }
    const req = indexedDB.open(IDB_NOM, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains('snapshot')) db.createObjectStore('snapshot', { keyPath: 'ecoleId' });
      if(!db.objectStoreNames.contains('file_attente')) db.createObjectStore('file_attente', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return __idbPromise;
}
async function idbGet(store, cle){
  const db = await ouvrirIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(cle);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(store, valeur){
  const db = await ouvrirIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(valeur);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbAdd(store, valeur){
  const db = await ouvrirIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).add(valeur);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGetAll(store){
  const db = await ouvrirIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function idbDelete(store, cle){
  const db = await ouvrirIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(cle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Distingue une vraie coupure réseau d'une erreur applicative (refus RLS,
// donnée invalide...) — seule une coupure réseau doit mettre l'opération
// en file d'attente ; une vraie erreur doit continuer à remonter normalement.
function erreurReseau(e){
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = ((e && e.message) || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed') || e instanceof TypeError;
}

let compteurFileAttente = 0;
async function majCompteurFileAttente(){
  try{ compteurFileAttente = (await idbGetAll('file_attente')).length; }
  catch(_e){ compteurFileAttente = 0; }
  if(typeof onFileAttenteChange === 'function') onFileAttenteChange(compteurFileAttente);
}
async function mettreEnFileAttente(type, table, payload){
  await idbAdd('file_attente', { type, table, payload, ecoleId: session.ecoleId, horodatage: Date.now() });
  await majCompteurFileAttente();
}

let __synchroEnCours = false;
async function synchroniserFileAttente(){
  if(__synchroEnCours || typeof navigator === 'undefined' || navigator.onLine === false) return;
  __synchroEnCours = true;
  try{
    let items;
    try{ items = await idbGetAll('file_attente'); }catch(_e){ return; }
    items.sort((a,b) => a.id - b.id);
    for(const item of items){
      try{
        let error = null;
        if(item.type === 'insert'){
          ({ error } = await sb.from(item.table).insert(item.payload));
        } else if(item.type === 'update'){
          const { id, ecole_id, ...patch } = item.payload;
          ({ error } = await sb.from(item.table).update(patch).eq('id', id).eq('ecole_id', ecole_id));
        } else if(item.type === 'delete'){
          ({ error } = await sb.from(item.table).delete().eq('id', item.payload.id).eq('ecole_id', item.payload.ecole_id));
        } else if(item.type === 'deleteWhere'){
          let q = sb.from(item.table).delete().eq('ecole_id', item.payload.ecole_id);
          for(const k in item.payload.match) q = q.eq(k, item.payload.match[k]);
          ({ error } = await q);
        }
        if(error){
          if(erreurReseau(error)) break; // coupure pendant la synchro : on réessaiera plus tard
          throw error; // vraie erreur applicative
        }
        await idbDelete('file_attente', item.id);
      }catch(e){
        if(erreurReseau(e)) break;
        // Erreur applicative sur un élément en file d'attente (conflit, donnée
        // devenue invalide...) : on journalise et on retire quand même
        // l'élément, pour ne pas bloquer indéfiniment le reste de la file.
        try{ await sb.from('erreurs_client').insert({ ecole_id: session.ecoleId, role: session.role, message: 'Échec synchro hors-ligne : ' + e.message, pile: JSON.stringify(item).slice(0,4000) }); }catch(_e2){}
        await idbDelete('file_attente', item.id);
      }
    }
    await majCompteurFileAttente();
  } finally { __synchroEnCours = false; }
}
if(typeof window !== 'undefined'){
  window.addEventListener('online', () => { synchroniserFileAttente(); });
  setInterval(() => synchroniserFileAttente(), 30000);
}

/* ---------------------------------------------------------------------
   CRUD génériques — chaque appel passe par les policies RLS du projet.
   En cas de coupure réseau, insert/update/delete sont mis en file
   d'attente au lieu d'échouer : la fonction se comporte comme si
   l'opération avait réussi (elle sera rejouée automatiquement plus
   tard), pour que tout le code appelant existant continue de fonctionner
   sans changement.
   --------------------------------------------------------------------- */
async function dbSelectAll(table, orderBy){
  let q = sb.from(table).select('*').eq('ecole_id', session.ecoleId);
  if(orderBy) q = q.order(orderBy);
  const { data, error } = await q;
  if(error) throw error;
  return rowsToCamel(data);
}
// NOTE : l'id est désormais TOUJOURS généré côté client (crypto.randomUUID),
// y compris en ligne — nécessaire pour pouvoir rendre immédiatement une
// ligne "optimiste" avec un vrai id quand l'insertion est mise en file
// d'attente hors ligne. Un éventuel id déjà présent dans l'objet (ex. id
// temporaire généré par buildSeed) est toujours ignoré/remplacé.
async function dbInsert(table, objCamel){
  const { id, ...rest } = objCamel;
  const row = objToSnake({ ...rest, id: crypto.randomUUID(), ecoleId: session.ecoleId });
  try{
    const { data, error } = await sb.from(table).insert(row).select().single();
    if(error) throw error;
    return rowToCamel(data);
  }catch(e){
    if(!erreurReseau(e)) throw e;
    await mettreEnFileAttente('insert', table, row);
    return rowToCamel(row);
  }
}
async function dbInsertMany(table, objsCamel){
  if(!objsCamel.length) return [];
  const rows = objsCamel.map(o => { const { id, ...rest } = o; return objToSnake({ ...rest, id: crypto.randomUUID(), ecoleId: session.ecoleId }); });
  try{
    const { data, error } = await sb.from(table).insert(rows).select();
    if(error) throw error;
    return rowsToCamel(data);
  }catch(e){
    if(!erreurReseau(e)) throw e;
    for(const row of rows) await mettreEnFileAttente('insert', table, row);
    return rowsToCamel(rows);
  }
}
async function dbUpdate(table, id, patchCamel){
  const patch = objToSnake(patchCamel);
  try{
    const { error } = await sb.from(table).update(patch).eq('id', id).eq('ecole_id', session.ecoleId);
    if(error) throw error;
  }catch(e){
    if(!erreurReseau(e)) throw e;
    await mettreEnFileAttente('update', table, { id, ecole_id: session.ecoleId, ...patch });
  }
}
async function dbDelete(table, id){
  try{
    const { error } = await sb.from(table).delete().eq('id', id).eq('ecole_id', session.ecoleId);
    if(error) throw error;
  }catch(e){
    if(!erreurReseau(e)) throw e;
    await mettreEnFileAttente('delete', table, { id, ecole_id: session.ecoleId });
  }
}
async function dbDeleteWhere(table, matchCamel){
  try{
    let q = sb.from(table).delete().eq('ecole_id', session.ecoleId);
    for(const k in matchCamel) q = q.eq(camelToSnake(k), matchCamel[k]);
    const { error } = await q;
    if(error) throw error;
  }catch(e){
    if(!erreurReseau(e)) throw e;
    const matchSnake = {}; for(const k in matchCamel) matchSnake[camelToSnake(k)] = matchCamel[k];
    await mettreEnFileAttente('deleteWhere', table, { ecole_id: session.ecoleId, match: matchSnake });
  }
}

/* ---------------------------------------------------------------------
   Chargement complet des données de l'école courante
   Reconstruit un objet DB de la même forme que l'ancien modèle
   localStorage, pour que toutes les fonctions d'affichage existantes
   continuent de fonctionner sans changement.
   --------------------------------------------------------------------- */
async function loadAllFromSupabase(){
  const [ecoleRow, classesRows, eleves, enseignants, notes, presencesEleves,
    presencesEnseignants, emploiTemps, programmes, bulletinsRows,
    paiementsScolarite, activites, inscriptionsActivites, paiementsCotisations,
    gadgets, ventesGadgets, personnelAutre, paiementsSalaires, depenses, messages,
    alertesPointage, echeancesScolarite, profiles
  ] = await Promise.all([
    sb.from('ecoles').select('*').eq('id', session.ecoleId).single(),
    dbSelectAll('classes'),
    dbSelectAll('eleves'),
    // "enseignants_lecture" (pas "enseignants" directement) : une vue qui
    // masque automatiquement téléphone/email/salaire/jeton QR pour tout
    // le monde sauf le personnel administratif — voir schema.sql section 21.
    dbSelectAll('enseignants_lecture'),
    dbSelectAll('notes'),
    dbSelectAll('presences_eleves'),
    dbSelectAll('presences_enseignants'),
    dbSelectAll('emploi_temps'),
    dbSelectAll('programmes'),
    dbSelectAll('bulletins_commentaires'),
    dbSelectAll('paiements_scolarite'),
    dbSelectAll('activites'),
    dbSelectAll('inscriptions_activites'),
    dbSelectAll('paiements_cotisations'),
    dbSelectAll('gadgets'),
    dbSelectAll('ventes_gadgets'),
    dbSelectAll('personnel_autre'),
    dbSelectAll('paiements_salaires'),
    dbSelectAll('depenses'),
    dbSelectAll('messages'),
    // Tolérant à l'absence de la table (migration pas encore appliquée) :
    // ne doit jamais empêcher le reste de l'application de charger.
    dbSelectAll('alertes_pointage').catch(()=>[]),
    dbSelectAll('echeances_scolarite').catch(()=>[]),
    dbSelectAll('profiles').catch(()=>[]),
  ]);

  if(ecoleRow.error) throw ecoleRow.error;
  const ecole = rowToCamel(ecoleRow.data);

  // La table "classes" porte la colonne frais_scolarite : on la reconstruit
  // ici sous la forme { classeId: montant } attendue par le reste de l'appli.
  const fraisScolarite = {};
  classesRows.forEach(c => { fraisScolarite[c.id] = c.fraisScolarite || 0; });

  // bulletins_commentaires : clé composite (eleveId_trimestre) -> texte,
  // comme l'ancien objet DB.bulletinsComments.
  const bulletinsComments = {};
  bulletinsRows.forEach(b => { bulletinsComments[`${b.eleveId}_${b.trimestre}`] = b.commentaire; });

  return {
    meta: {
      nomEcole: ecole.nomEcole, adresse: ecole.adresse, telephone: ecole.telephone,
      anneeScolaire: ecole.anneeScolaire, directeurNom: ecole.directeurNom,
      fondateurNom: ecole.fondateurNom, logo: ecole.logoUrl || '',
      loyerMensuel: ecole.loyerMensuel || 0,
      niveaux: ecole.niveaux != null ? ecole.niveaux : ['prescolaire','primaire'], // [] explicite (nouvelle école vidée) ≠ null (colonne jamais définie)
      heureArriveeAttendue: (ecole.heureArriveeAttendue || '07:30:00').slice(0,5),
      actif: ecole.actif !== false,
      accesSupportDeveloppeur: ecole.accesSupportDeveloppeur === true,
    },
    classes: classesRows,
    eleves, enseignants, notes, presencesEleves, presencesEnseignants,
    emploiTemps, programmes, bulletinsComments,
    fraisScolarite, paiementsScolarite, activites, inscriptionsActivites,
    paiementsCotisations, gadgets, ventesGadgets, personnelAutre,
    paiementsSalaires, depenses, messages, alertesPointage,
    echeancesScolarite: echeancesScolarite.slice().sort((a,b)=> (a.ordre-b.ordre) || (a.dateEcheance||'').localeCompare(b.dateEcheance||'')),
    profiles,
  };
}

/* ---------------------------------------------------------------------
   Envoi des données de démonstration générées par buildSeed() vers
   Supabase (utilisé par le bouton "Recharger les données démo").
   buildSeed() reste inchangée : elle fabrique un objet en mémoire ;
   cette fonction se contente de le téléverser table par table.
   --------------------------------------------------------------------- */
async function pousserSeedVersSupabase(seed){
  // 1) École (mise à jour des infos, on garde l'ecole_id existant)
  await sb.from('ecoles').update(objToSnake({
    nomEcole: seed.meta.nomEcole, adresse: seed.meta.adresse, telephone: seed.meta.telephone,
    anneeScolaire: seed.meta.anneeScolaire, directeurNom: seed.meta.directeurNom,
    fondateurNom: seed.meta.fondateurNom, loyerMensuel: seed.meta.loyerMensuel,
    niveaux: seed.meta.niveaux,
  })).eq('id', session.ecoleId);

  // 2) Purge des anciennes données opérationnelles de cette école
  const tables = ['messages','depenses','paiements_salaires','personnel_autre','ventes_gadgets',
    'gadgets','paiements_cotisations','inscriptions_activites','activites','paiements_scolarite',
    'bulletins_commentaires','programmes','emploi_temps','presences_enseignants','presences_eleves',
    'notes','eleves','enseignants','classes'];
  for(const t of tables){ await sb.from(t).delete().eq('ecole_id', session.ecoleId); }

  // 3) Ré-insertion classes (avec frais_scolarite fusionné) — id texte fixe, pas d'uuid auto
  const classesRows = seed.classes.map(c => objToSnake({
    id: c.id, ecoleId: session.ecoleId, nom: c.nom, cycle: c.cycle,
    fraisScolarite: seed.fraisScolarite[c.id] || 0,
  }));
  await sb.from('classes').insert(classesRows);

  // 4) Enseignants (on capture le mapping ancien id -> nouvel id Supabase)
  const ensMap = {};
  for(const t of seed.enseignants){
    const { id, classesAssignees, matieres, ...rest } = t;
    const inserted = await dbInsert('enseignants', { ...rest, classesAssignees, matieres });
    ensMap[id] = inserted.id;
  }
  // Titulaires de classe (maintenant que les enseignants ont un id définitif)
  for(const c of seed.classes){
    if(c.titulaireId) await dbUpdate('classes', c.id, { titulaireId: ensMap[c.titulaireId] });
  }

  // 5) Élèves
  const elMap = {};
  for(const e of seed.eleves){
    const { id, ...rest } = e;
    const inserted = await dbInsert('eleves', rest);
    elMap[id] = inserted.id;
  }

  // 6) Notes, présences, emploi du temps, programmes (dépendent des maps ci-dessus)
  await dbInsertMany('notes', seed.notes.map(n => ({ ...n, eleveId: elMap[n.eleveId] })));
  await dbInsertMany('presences_eleves', seed.presencesEleves.map(p => ({ ...p, eleveId: elMap[p.eleveId] })));
  await dbInsertMany('presences_enseignants', seed.presencesEnseignants.map(p => ({ ...p, enseignantId: ensMap[p.enseignantId] })));
  await dbInsertMany('emploi_temps', seed.emploiTemps.map(s => ({ ...s, enseignantId: ensMap[s.enseignantId] })));
  await dbInsertMany('programmes', seed.programmes.map(p => ({ ...p, enseignantId: ensMap[p.enseignantId] })));

  // 7) Comptabilité
  await dbInsertMany('paiements_scolarite', seed.paiementsScolarite.map(p => ({ ...p, eleveId: elMap[p.eleveId] })));
  const actMap = {};
  for(const a of seed.activites){ const { id, ...rest } = a; const inserted = await dbInsert('activites', rest); actMap[id] = inserted.id; }
  await dbInsertMany('inscriptions_activites', seed.inscriptionsActivites.map(i => ({ ...i, eleveId: elMap[i.eleveId], activiteId: actMap[i.activiteId] })));
  await dbInsertMany('paiements_cotisations', seed.paiementsCotisations.map(p => ({ ...p, eleveId: elMap[p.eleveId], activiteId: actMap[p.activiteId] })));
  const gadMap = {};
  for(const g of seed.gadgets){ const { id, ...rest } = g; const inserted = await dbInsert('gadgets', rest); gadMap[id] = inserted.id; }
  await dbInsertMany('ventes_gadgets', seed.ventesGadgets.map(v => ({ ...v, gadgetId: gadMap[v.gadgetId], eleveId: v.eleveId ? elMap[v.eleveId] : null })));
  const persMap = {};
  for(const p of seed.personnelAutre){ const { id, ...rest } = p; const inserted = await dbInsert('personnel_autre', rest); persMap[id] = inserted.id; }
  await dbInsertMany('paiements_salaires', seed.paiementsSalaires.map(p => ({
    ...p, personnelId: p.personnelType==='enseignant' ? ensMap[p.personnelId] : persMap[p.personnelId],
  })));
  await dbInsertMany('depenses', seed.depenses);

  // 8) Messagerie
  await dbInsertMany('messages', seed.messages.map(m => ({
    ...m, eleveId: m.eleveId ? elMap[m.eleveId] : null, enseignantId: m.enseignantId ? ensMap[m.enseignantId] : null,
  })));
}
