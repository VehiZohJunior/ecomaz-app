// EcoMaZ — Test « démarrage sans réseau » dans un vrai navigateur (21/11/2026).
// 1re visite en ligne (le service worker garde l'application ET ses bibliothèques),
// puis coupure TOTALE du réseau et réouverture : l'application doit démarrer.
// Usage : node tools/captures/test-hors-ligne.mjs  (aperçu local http://localhost:5190 démarré)
import { chromium } from 'playwright-core';
const nav = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' }));
let ok = true; const verif = (c, t) => { console.log((c ? '✅ ' : '❌ ') + t); ok = ok && c; };
for(const page_ of ['index.html', 'parent.html', 'portier.html', 'enseignant.html']){
  const ctx = await nav.newContext();
  // La base n'est jamais jointe dans ce test (seuls les fichiers de l'application comptent)
  await ctx.route('https://hvqtsvpkxffseclsfoun.supabase.co/**', r => r.abort());
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
  await page.goto('http://localhost:5190/' + page_, { waitUntil: 'load' });
  // Attendre que le service worker soit actif et que les bibliothèques soient gardées
  await page.evaluate(async () => { await navigator.serviceWorker.ready; for(let i = 0; i < 40; i++){ const c = await caches.open('ecomaz-cdn-v1'); if((await c.keys()).length >= 3) break; await new Promise(r => setTimeout(r, 250)); } });
  const garde = await page.evaluate(async () => (await (await caches.open('ecomaz-cdn-v1')).keys()).map(r => r.url.split('/npm/')[1] || r.url));
  await ctx.setOffline(true);
  erreurs.length = 0;
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(2500);
  const etat = await page.evaluate(() => ({ supabase: typeof window.supabase !== 'undefined', jsQR: typeof window.jsQR === 'function', qrcode: typeof window.qrcode === 'function', texte: document.body.innerText.trim().length }));
  verif(garde.length >= 3 && etat.supabase && etat.jsQR && etat.qrcode && etat.texte > 20 && !erreurs.some(m => /supabase is not defined|SyntaxError|ReferenceError/.test(m)),
    `${page_} démarre sans réseau (bibliothèques gardées : ${garde.length} ; connexion ${etat.supabase ? 'chargée' : 'ABSENTE'}${erreurs.length ? ' ; erreurs : ' + erreurs.join(' | ').slice(0, 160) : ''})`);
  await ctx.close();
}
await nav.close();
process.exit(ok ? 0 : 1);
