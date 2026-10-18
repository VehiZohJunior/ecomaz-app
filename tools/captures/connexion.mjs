// =====================================================================
// EcoMaZ — Captures des écrans de connexion (DESIGN.md §11, étape 9)
// Aucune connexion n'est faite : on photographie seulement les écrans.
// La page parent.html lit la vitrine PUBLIQUE de l'école démo (lecture seule).
// Usage : node tools/captures/connexion.mjs <nom>
// =====================================================================
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');
const [nom = 'connexion'] = process.argv.slice(2);
const ecole = JSON.parse(readFileSync(join(ICI, 'donnees-demo.json'), 'utf8'))._ecole_id;
const sortie = join(RACINE, 'captures', nom);
mkdirSync(sortie, { recursive: true });
const ECRANS = [
  ['espaces', '/', () => showEspaces()],
  ['formulaire', '/', () => chooseEspace('direction')],
  ['oubli', '/', () => showForgotPassword()],
  ['chargement', '/', () => afficherChargementDemarrage()],
  ['erreur-reseau', '/', () => afficherErreurDemarrage()],
  ['parent', `/parent.html?ecole=${ecole}`, null],
  ['enseignant', `/enseignant.html?ecole=${ecole}`, null],
];
const navigateur = await chromium.launch({ channel: 'msedge', headless: true });
let n = 0;
for(const theme of ['light', 'dark']){
  for(const [largeur, hauteur] of [[360, 780], [390, 844], [1440, 900]]){
    const contexte = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, colorScheme: theme, locale: 'fr-FR' });
    await contexte.addInitScript(t => { try{ localStorage.setItem('ecomaz_theme', t); }catch(_e){} }, theme);
    for(const [ecran, chemin, geste] of ECRANS){
      const page = await contexte.newPage();
      page.on('pageerror', e => console.log(`ERREUR PAGE ${ecran} (${largeur}px) : ${e.message}`));
      await page.goto('http://localhost:5190' + chemin, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      if(geste){ await page.evaluate(geste); await page.waitForTimeout(500); }
      await page.screenshot({ path: join(sortie, `${ecran}_${largeur}_${theme === 'light' ? 'clair' : 'sombre'}.png`), fullPage: true });
      await page.close(); n++;
    }
    await contexte.close();
  }
}
await navigateur.close();
console.log(`${n} capture(s) dans captures/${nom}/`);
