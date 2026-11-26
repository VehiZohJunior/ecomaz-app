// =====================================================================
// EcoMaZ — Captures pour le guide d'utilisation et la vidéo (26/11/2026)
// ---------------------------------------------------------------------
// Ouvre la VERSION DE DÉMONSTRATION locale (http://localhost:5191, base
// fictive dans le navigateur, aucune donnée réelle) dans Microsoft Edge,
// au format téléphone, et photographie les écrans décrits dans scenes.mjs.
// Le nom de l'école fictive est remplacé par « Votre école ».
// Usage : node tools/guide/capturer_guide.mjs [role,...]
// Résultat : tools/guide/captures/<role>/<nn>-<nom>.png
// =====================================================================
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(ICI, '..', 'captures', 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:5191/';
const roles = (process.argv[2] || Object.keys(SCENES).join(',')).split(',');
const attendre = ms => new Promise(r => setTimeout(r, ms));

const navigateur = await chromium.launch({ channel: 'msedge' });
for (const role of roles) {
  const def = SCENES[role];
  const dossier = join(ICI, 'captures', role);
  mkdirSync(dossier, { recursive: true });
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, bypassCSP: true, colorScheme: 'light', locale: 'fr-FR', serviceWorkers: 'block' });
  await ctx.route('**/demo-donnees.js', async route => {
    const r = await route.fetch(); let t = await r.text();
    t = t.replaceAll('École Les Flamboyants', 'Votre école').replaceAll('école fictive', 'adresse de l’école');
    await route.fulfill({ response: r, body: t });
  });
  await ctx.addInitScript(([id]) => {
    try {
      if (!sessionStorage.getItem('guide_init')) { localStorage.clear(); sessionStorage.setItem('guide_init', '1'); }
      localStorage.setItem('ecomaz_demo_utilisateur', id);
      for (let i = 0; i < localStorage.length; i++) {}
    } catch (_e) {}
    // Pas de fenêtre « EcoMaZ a été mis à jour » ni de pastille DÉMO sur les captures
    window.__GUIDE__ = true;
  }, [def.id]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  ⚠ ${role} : ${e.message}`));
  await page.goto(BASE + def.page, { waitUntil: 'load' });
  await attendre(3500);
  await page.evaluate(() => {
    try { (window.VERSIONS || []).forEach(v => localStorage.setItem(`ecomaz_nouveautes_${v.version}_${session.userId}`, '1')); } catch (_e) {}
    document.querySelectorAll('.nouveautes-overlay, #nouveautesModal').forEach(e => e.remove());
    const s = document.createElement('style');
    s.textContent = '#demo-pastille{display:none!important} #appelObligatoire{display:none!important} .toast,#toastStack{display:none!important}';
    document.head.appendChild(s);
    if (typeof closeModal === 'function') closeModal();
  });
  let n = 0;
  for (const sc of def.scenes) {
    n++;
    try {
      if (sc.avant) await page.evaluate(sc.avant);
      await attendre(sc.attente || 900);
      const fichier = join(dossier, `${String(n).padStart(2, '0')}-${sc.nom}.png`);
      await page.screenshot({ path: fichier, fullPage: false });
      console.log(`  ✓ ${role}/${String(n).padStart(2, '0')}-${sc.nom}`);
      if (sc.apres) await page.evaluate(sc.apres);
    } catch (e) { console.log(`  ✗ ${role}/${sc.nom} : ${e.message.split('\n')[0]}`); }
  }
  await ctx.close();
}
await navigateur.close();
