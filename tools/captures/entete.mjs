// Vérifie le bouton Recherche de l'en-tête après deux bascules de thème (clair/sombre)
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'msedge', headless: true });
for (const [l, h] of [[360, 780], [390, 844], [1440, 900]]) {
  const p = await b.newPage({ viewport: { width: l, height: h } });
  await p.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    const rech = document.getElementById('btnRechercheGlobale');
    const t = document.querySelector('.topbar-right .theme-toggle:not(#btnRechercheGlobale)');
    t.click(); await new Promise(x => setTimeout(x, 200)); t.click(); await new Promise(x => setTimeout(x, 200));
    return { loupe: rech.innerHTML.includes('search'), lune: /moon|sun/.test(rech.innerHTML) };
  });
  console.log(l + 'px', JSON.stringify(r));
  await p.close();
}
await b.close();
