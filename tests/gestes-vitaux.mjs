// =====================================================================
// EcoMaZ — Tests automatiques des GESTES VITAUX (21/11/2026)
// =====================================================================
// Dans un vrai navigateur, avec une FAUSSE base en mémoire (aucun accès au
// vrai serveur, aucune donnée réelle) : connexion, appel des élèves,
// paiement de scolarité + reste dû, reçu (numéro, montant en lettres).
// Usage : node tests/gestes-vitaux.mjs   (depuis PowerShell : il ouvre un navigateur)
// =====================================================================
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(RACINE, 'tools', 'captures', 'package.json'))('playwright-core');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const serveur = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/')) p += 'index.html';
  const f = join(RACINE, p); if(!f.startsWith(RACINE) || !existsSync(f)){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
}).listen(0);
const nav = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' }));
const ctx = await nav.newContext({ serviceWorkers: 'block' });
await ctx.route('https://hvqtsvpkxffseclsfoun.supabase.co/**', r => r.abort());
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const CDN = new Map();
await ctx.route('https://cdn.jsdelivr.net/**', async r => { const u = r.request().url();
  try{ if(!CDN.has(u)) CDN.set(u, Buffer.from(await (await fetch(u, { signal: AbortSignal.timeout(20000) })).arrayBuffer()));
    await r.fulfill({ status: 200, body: CDN.get(u), headers: { 'content-type': 'application/javascript; charset=utf-8', 'access-control-allow-origin': '*' } }); }catch(_e){ await r.abort(); } });
const page = await ctx.newPage();
const erreursPage = []; page.on('pageerror', e => erreursPage.push(e.message));
page.on('dialog', d => d.accept());
await page.goto(`http://localhost:${serveur.address().port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1200);
for(let k = 0; k < 60; k++){ if(await page.evaluate(() => { try{ return typeof sb === 'object' && typeof renderView === 'function'; }catch(_e){ return false; } })) break; await page.waitForTimeout(500); }

// ---- Fausse base : tables en mémoire, journal des écritures
await page.evaluate(() => {
  const E = 'ecole-essai', C = 'classe-cp1';
  window.__T = {
    profiles: [{ id: 'u-dir', ecole_id: E, role: 'direction', nom_complet: 'Directeur Essai', mdp_a_changer: false }],
    ecoles: [{ id: E, nom_ecole: 'École Essai', actif: true, niveaux: ['prescolaire', 'primaire'] }],
    classes: [{ id: C, code: 'cp1', ecole_id: E, nom: 'CP1', cycle: 'Primaire' }],   // code de niveau : sinon la classe est masquée (niveaux de l'école)
    eleves: [1, 2, 3].map(i => ({ id: 'el-' + i, ecole_id: E, nom: 'ESSAI', prenom: 'Élève' + i, classe_id: C, statut: 'Actif', sexe: i % 2 ? 'M' : 'F', matricule: 'M' + i })),
    echeances_scolarite: ['1er versement', '2e versement', '3e versement'].map((l, i) => ({ id: 'ech-' + i, ecole_id: E, label: l, montant: 100000, ordre: i, classe_id: C })),
  };
  window.__ecritures = [];
  const T = window.__T;
  window.__lectures = [];
  const fabrique = (table) => {
    window.__lectures.push(table);
    let lignes = (T[table] || []).slice(), op = 'select', donnees = null, filtres = [], une = false, peutEtre = false, avecRetour = false;
    const q = {
      select(){ avecRetour = op !== 'select'; return q; },
      eq(c, v){ filtres.push(l => l[c] === v); return q; }, neq(){ return q; }, gte(c, v){ filtres.push(l => l[c] >= v); return q; }, lte(c, v){ filtres.push(l => l[c] <= v); return q; },
      in(c, v){ filtres.push(l => v.includes(l[c])); return q; }, is(){ return q; }, not(){ return q; }, or(){ return q; }, ilike(){ return q; }, filter(){ return q; }, contains(){ return q; },
      order(){ return q; }, limit(n){ return q; }, range(a, b){ q.__range = [a, b]; return q; },
      single(){ une = true; return q; }, maybeSingle(){ peutEtre = true; return q; },
      insert(x){ op = 'insert'; donnees = Array.isArray(x) ? x : [x]; return q; },
      update(x){ op = 'update'; donnees = x; return q; }, upsert(x){ op = 'insert'; donnees = Array.isArray(x) ? x : [x]; return q; },
      delete(){ op = 'delete'; return q; },
      then(ok, ko){
        let res;
        if(op === 'insert'){ T[table] = (T[table] || []).concat(donnees); window.__ecritures.push({ table, op, donnees: JSON.parse(JSON.stringify(donnees)) }); res = { data: une ? donnees[0] : donnees, error: null }; }
        else if(op === 'update'){ const cibles = (T[table] || []).filter(l => filtres.every(f => f(l))); cibles.forEach(l => Object.assign(l, donnees)); window.__ecritures.push({ table, op, donnees, n: cibles.length }); res = { data: une ? cibles[0] : cibles, error: null }; }
        else if(op === 'delete'){ const avant = (T[table] || []).length; T[table] = (T[table] || []).filter(l => !filtres.every(f => f(l))); window.__ecritures.push({ table, op, n: avant - T[table].length }); res = { data: null, error: null }; }
        else { let r = lignes.filter(l => filtres.every(f => f(l))); if(q.__range) r = r.slice(q.__range[0], q.__range[1] + 1); res = (une || peutEtre) ? { data: r[0] || null, error: une && !r[0] ? { message: 'aucune ligne' } : null } : { data: r, count: r.length, error: null }; }
        return Promise.resolve(res).then(ok, ko);
      },
    };
    return q;
  };
  const utilisateur = { id: 'u-dir', email: 'essai@exemple.test' };
  sb.from = fabrique;
  sb.rpc = async () => ({ data: [], error: null });
  try{ Object.defineProperty(sb, 'functions', { value: { invoke: async () => ({ data: { ok: true }, error: null }) }, configurable: true }); }catch(_e){}
  sb.channel = () => { const c = { on(){ return c; }, subscribe(){ return c; }, unsubscribe(){} }; return c; };
  sb.removeChannel = () => {};
  sb.auth.signInWithPassword = async ({ email, password }) => password === 'bon-mot-de-passe-1' ? { data: { user: utilisateur, session: { user: utilisateur } }, error: null } : { data: {}, error: { message: 'Invalid login credentials' } };
  sb.auth.getSession = async () => ({ data: { session: { user: utilisateur } } });
  sb.auth.getUser = async () => ({ data: { user: utilisateur } });
  sb.auth.mfa.getAuthenticatorAssuranceLevel = async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
});

let ok = true;
const verif = (c, t) => { console.log((c ? '✅ ' : '❌ ') + t); ok = ok && !!c; };
const essai = async (titre, fn) => { console.log('\n' + titre); try{ await fn(); }catch(e){ verif(false, 'Plantage : ' + e.message.split('\n')[0]); } };

await essai('1. CONNEXION', async () => {
  const faux = await page.evaluate(async () => (await connexion('essai@exemple.test', 'mauvais')).message);
  verif(/incorrect/i.test(faux || ''), 'Mauvais mot de passe : refusé avec un message clair');
  const r = await page.evaluate(async () => { const c = await connexion('essai@exemple.test', 'bon-mot-de-passe-1'); return { ok: c.ok, role: session.role, ecole: session.ecoleId }; });
  verif(r.ok && r.role === 'direction' && r.ecole === 'ecole-essai', 'Bon mot de passe : profil chargé (rôle, école)');
  await page.evaluate(async () => { window.__T.profiles[0].mdp_a_changer = true; await chargerProfilCourant(); await entrerSelonRole(); });
  verif(await page.$('#resetPassword1'), 'Mot de passe personnel obligatoire : écran imposé avant toute donnée');
  await page.evaluate(async () => { window.__T.profiles[0].mdp_a_changer = false; await chargerProfilCourant(); await entrerSelonRole(); });
  await page.waitForTimeout(1500);
  const entre = await page.evaluate(() => ({ role: ui.role, eleves: (DB?.eleves || []).length, vue: document.getElementById('viewContainer')?.innerText.length || 0 }));
  if(process.env.TRACE) console.log('TRACE', await page.evaluate(async () => ({ dbEleves: (DB?.eleves || []).length, direct: (await dbSelectAll('eleves')).length, fixture: window.__T.eleves.length, ecole: session.ecoleId })));
  verif(entre.role === 'direction' && entre.eleves === 3 && entre.vue > 50, `Entrée dans l’application : données chargées (${entre.eleves} élèves) et tableau de bord affiché`);
});

await essai('2. APPEL DES ÉLÈVES', async () => {
  const r = await page.evaluate(async () => {
    window.verifierPositionAvantAppel = async () => true;
    window.__ecritures.length = 0;
    ui.filters.presEleves = { date: todayISO(), classeId: 'classe-cp1' };
    renderView('presences-eleves');
    const sel = [...document.querySelectorAll('.sel-statut')];
    const valeurs = { 'el-1': 'Présent', 'el-2': 'Absent', 'el-3': 'Retard' };
    sel.forEach(s => { s.value = valeurs[s.dataset.eleve]; });
    await savePresencesEleves();
    const ins = window.__ecritures.filter(e => e.table === 'presences_eleves' && e.op === 'insert').flatMap(e => e.donnees);
    const premier = { n: sel.length, ins: ins.map(l => l.eleve_id + '=' + l.statut).sort() };
    // Correction : Élève2 était présent finalement
    window.__ecritures.length = 0;
    renderView('presences-eleves');
    document.querySelector('.sel-statut[data-eleve="el-2"]').value = 'Présent';
    await savePresencesEleves();
    const maj = window.__ecritures.filter(e => e.table === 'presences_eleves');
    return { premier, maj: maj.map(e => e.op + ':' + (e.donnees?.statut || '')), memoire: DB.presencesEleves.filter(p => p.date === todayISO()).map(p => p.eleveId + '=' + p.statut).sort() };
  });
  verif(r.premier.n === 3, `Feuille d’appel : 3 élèves affichés (${r.premier.n})`);
  verif(JSON.stringify(r.premier.ins) === JSON.stringify(['el-1=Présent', 'el-2=Absent', 'el-3=Retard']), `Enregistrement : un envoi par élève avec le bon statut (${r.premier.ins.join(', ')})`);
  verif(r.maj.length === 1 && r.maj[0] === 'update:Présent', `Correction : une seule modification envoyée, pas de doublon (${r.maj.join(', ')})`);
  verif(JSON.stringify(r.memoire) === JSON.stringify(['el-1=Présent', 'el-2=Présent', 'el-3=Retard']), 'Écran à jour après la correction');
});

await essai('3. PAIEMENT DE SCOLARITÉ ET RESTE DÛ', async () => {
  const r = await page.evaluate(async () => {
    window.__ecritures.length = 0;
    DB.paiementsScolarite = [];
    const avant = scolariteEleveParEcheance('el-1');
    const form = document.createElement('form');
    form.innerHTML = '<input name="montant" value="150000"><input name="tranche" value="1er versement"><input name="date" value="2026-11-21"><input name="modePaiement" value="Mobile Money">';
    document.body.appendChild(form);
    await handleSavePaiementScolarite({ preventDefault(){}, target: form }, 'el-1');
    form.remove();
    const ecrit = window.__ecritures.filter(e => e.table === 'paiements_scolarite' && e.op === 'insert').flatMap(e => e.donnees);
    const apres = scolariteEleveParEcheance('el-1');
    const recu = document.querySelector('.recu')?.innerText || '';
    return { avant, ecrit, apres, recu };
  });
  verif(r.avant.total === 300000 && r.avant.reste === 300000, `Avant paiement : dû 300 000, reste ${r.avant.reste}`);
  verif(r.ecrit.length === 1 && Number(r.ecrit[0].montant) === 150000 && r.ecrit[0].mode_paiement === 'Mobile Money', 'Paiement envoyé une seule fois, montant et mode exacts');
  verif(r.apres.totalPaye === 150000 && r.apres.reste === 150000, `Après paiement : payé ${r.apres.totalPaye}, reste ${r.apres.reste}`);
  verif(r.apres.detail[0].statut === 'paye' && r.apres.detail[2].statut === 'impaye', 'Détail par versement : 1er payé, 3e impayé');
  verif(/150[\s  .]?000/.test(r.recu) && /cent cinquante mille/i.test(r.recu) && /REC-E-|N°/i.test(r.recu), 'Reçu ouvert : montant, montant en lettres, numéro');
});

await essai('4. REÇU : MONTANTS EN LETTRES', async () => {
  const cas = { 0: 'zéro', 21: 'vingt-et-un', 71: 'soixante-et-onze', 80: 'quatre-vingts', 81: 'quatre-vingt-un', 99: 'quatre-vingt-dix-neuf', 200: 'deux cents', 1000: 'mille', 150000: 'cent cinquante mille', 2500000: 'deux millions cinq cent mille', 200000: 'deux cent mille', 80000: 'quatre-vingt mille', 280000: 'deux cent quatre-vingt mille', 300: 'trois cents', 380: 'trois cent quatre-vingts', 200000000: 'deux cents millions', 80000000: 'quatre-vingts millions', 1001000: 'un million mille', 75500: 'soixante-quinze mille cinq cents' };
  const r = await page.evaluate(c => Object.fromEntries(Object.keys(c).map(n => [n, nombreEnLettres(Number(n))])), cas);
  for(const [n, attendu] of Object.entries(cas)) verif(r[n].replace(/\s+/g, ' ').trim().toLowerCase() === attendu, `${n} → « ${r[n]} »${r[n].replace(/\s+/g, ' ').trim().toLowerCase() === attendu ? '' : ' (attendu : « ' + attendu + ' »)'}`);
});

const graves = erreursPage.filter(m => !/Failed to fetch|NetworkError|net::/i.test(m));
verif(!graves.length, `Aucune erreur JavaScript pendant les essais${graves.length ? ' : ' + graves.slice(0, 3).join(' | ') : ''}`);
await nav.close(); serveur.close();
console.log(ok ? '\n✅ Tous les gestes vitaux fonctionnent.' : '\n❌ Au moins un geste vital ne fonctionne pas.');
process.exit(ok ? 0 : 1);
