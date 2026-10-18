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
const LARGEURS = [[360, 780], [390, 844], [1440, 900]];
const THEMES = ['light', 'dark'];
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
  sb.rpc = () => Promise.resolve({ data: [], error: null });
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
    page.on('pageerror', e => console.log(`ERREUR PAGE (${largeur}px) : ${e.message}`));
    await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.evaluate(installerDemo, donnees);
    await page.evaluate(async ({ eid, role, option }) => {
      session.userId = 'apercu-demo'; session.ecoleId = eid; session.role = role; session.nomComplet = 'Directeur Démo';
      ui.role = role;
      // Nouveautés marquées comme déjà vues AVANT l'entrée (sinon la fenêtre couvre l'écran)
      VERSIONS.forEach(v => { try{ localStorage.setItem(`ecomaz_nouveautes_${v.version}_apercu-demo`, '1'); }catch(_e){} });
      DB = await chargerDB();
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
      await page.evaluate(([v, o]) => { closeModal && closeModal(); if(o){ ui.filters.comptaTab = o; ui.filters.cahierOnglet = o; } go(v); window.scrollTo(0, 0); }, [ecran, onglet]);
      await page.waitForTimeout(900);
      if(extra === 'centre') await page.evaluate(() => { toggleCentre(true); });
      // Gestes d'essai (aucune écriture) : ouvrir une feuille ou un menu avant la photo
      const GESTES = {
        relier: () => { const d = document.querySelector('.pe-carte[data-etat="non"] .pe-relier'); d.open = true; const c = d.querySelector('.pe-cherche'); c.value = 'aka'; c.dispatchEvent(new Event('input')); d.scrollIntoView({ block: 'center' }); },
        plus: () => { const d = document.querySelector('.pe-carte[data-etat="non"] .pe-plus'); d.open = true; d.scrollIntoView({ block: 'center' }); },
        inviter: () => { document.querySelector('.pe-carte[data-etat="non"] .pe-actions .btn').click(); },
        absent: () => { document.querySelectorAll('.cj-btn[data-s="Absent"]')[1].click(); document.querySelectorAll('.cj-btn[data-s="Retard"]')[2].click(); },
        relies: () => { document.querySelector('.seg[data-etat="relie"]').click(); },
      };
      if(GESTES[extra]){ await page.evaluate(GESTES[extra]); await page.waitForTimeout(400); }
      if(extra === 'centre') await page.waitForTimeout(400);
      const mesure = await page.evaluate(() => { const t = document.querySelector('.topbar'); return t ? Math.round(t.getBoundingClientRect().height) : 0; });
      console.log(`${ecranBrut} ${largeur}px ${theme} : en-tête ${mesure}px`);
      await page.screenshot({ path: join(sortie, `${ecranBrut.replace('+', '-').replace(':', '-')}_${largeur}_${theme === 'light' ? 'clair' : 'sombre'}.png`), fullPage: !extra });
      n++;
    }
    await contexte.close();
  }
}
await navigateur.close();
console.log(`${n} capture(s) dans captures/${nom}/`);
