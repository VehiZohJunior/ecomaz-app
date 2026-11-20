// =====================================================================
// EcoMaZ — Contrôle des pages publiques (2026-11-20)
// =====================================================================
// Ouvre les pages publiques sur l'aperçu local (http://localhost:5190) et
// vérifie, en lecture seule : contraste des textes (WCAG), absence de
// défilement horizontal sur téléphone, images sans texte alternatif, champs
// sans étiquette, balises (titre, description, aperçu de partage, icône),
// liens cassés, et temps de chargement sur une connexion 4G lente simulée.
// Usage : node tools/captures/audit-public.mjs   → captures/audit-public/
// =====================================================================
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, '..', '..', 'captures', 'audit-public'); mkdirSync(SORTIE, { recursive: true });
const BASE = process.env.AUDIT_BASE || 'http://localhost:5190/';  // AUDIT_BASE=https://vehizohjunior.github.io/ecomaz-app/ : le site en ligne
const PAGES = process.env.AUDIT_PAGES ? process.env.AUDIT_PAGES.split(',') : [BASE.includes('localhost') ? 'landing/index.html' : 'landing/', 'confidentialite.html', 'conditions.html', '404.html', 'preinscription.html', 'index.html', 'parent.html'];
const navigateur = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' }));
const liensVus = new Map();
let problemes = 0;
const note = (ok, texte) => { if(!ok) problemes++; console.log(`  ${ok ? '✅' : '❌'} ${texte}`); };

async function statutLien(url){
  if(liensVus.has(url)) return liensVus.get(url);
  let code = 0;
  try{
    if(url.startsWith(BASE)){ const r = await fetch(url, { redirect: 'follow' }); code = r.status; }
    else code = Number(execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-L', '-m', '20', '-A', 'Mozilla/5.0', url]).toString());
  }catch(_e){ code = 0; }
  liensVus.set(url, code); return code;
}

for(const chemin of PAGES){
  console.log(`\n=== ${chemin}`);
  for(const [largeur, hauteur, theme] of [[360, 780, 'light'], [1440, 900, 'light'], [390, 844, 'dark']]){
    const ctx = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, colorScheme: theme, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const lent = largeur === 1440;
    if(lent){ const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 }); }
    const t0 = Date.now();
    await page.goto(BASE + chemin, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    const tLoad = Date.now() - t0;
    await page.waitForTimeout(lent ? 2500 : 1500);
    const r = await page.evaluate(() => {
      const rgba = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if(!m) return null; const v = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
      const lum = ([r, g, b]) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const fondDe = el => { const couches = []; for(let x = el; x; x = x.parentElement){ const cs = getComputedStyle(x); if(cs.backgroundImage && cs.backgroundImage !== 'none') return null; const c = rgba(cs.backgroundColor); if(c && c[3] > 0){ couches.push(c); if(c[3] >= 1) break; } } let res = [255, 255, 255]; for(let i = couches.length - 1; i >= 0; i--){ const [r, g, b, a] = couches[i]; res = [r * a + res[0] * (1 - a), g * a + res[1] * (1 - a), b * a + res[2] * (1 - a)]; } return res; };
      const contraste = []; const vus = new Set();
      document.querySelectorAll('body *').forEach(el => {
        if(![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
        if(el.closest('svg, [hidden], .sr-only, .champ-piege, select, option, [aria-hidden="true"]')) return;
        const cs = getComputedStyle(el); if(cs.display === 'none' || cs.visibility === 'hidden') return;
        const b = el.getBoundingClientRect(); if(!b.width || !b.height) return;
        for(let x = el; x; x = x.parentElement){ if(Number(getComputedStyle(x).opacity) < 0.95) return; }
        const c = rgba(cs.color), f = fondDe(el); if(!c || !f) return;
        const coul = [c[0] * c[3] + f[0] * (1 - c[3]), c[1] * c[3] + f[1] * (1 - c[3]), c[2] * c[3] + f[2] * (1 - c[3])];
        const L1 = lum(coul), L2 = lum(f), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const gros = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && Number(cs.fontWeight) >= 700);
        if(ratio < (gros ? 3 : 4.5)){ const cle = el.tagName + el.className + cs.color + f.join(); if(!vus.has(cle)){ vus.add(cle); contraste.push(`${Math.round(ratio * 100) / 100} ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} « ${el.textContent.trim().slice(0, 30)} »`); } }
      });
      const champsSansEtiquette = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(i => !i.closest('.champ-piege') && getComputedStyle(i).display !== 'none'
        && !(i.id && document.querySelector(`label[for="${i.id}"]`)) && !i.closest('label') && !i.getAttribute('aria-label')).map(i => i.id || i.name || i.type);
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const octets = performance.getEntriesByType('resource').reduce((t, e) => t + (e.transferSize || 0), nav.transferSize || 0);
      const m = n => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content || '';
      return {
        debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        imagesSansAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).map(i => i.src.slice(-40)),
        champsSansEtiquette, contraste: contraste.slice(0, 8),
        titre: document.title, description: m('description'), ogImage: m('og:image'), viewport: m('viewport'), icone: !!document.querySelector('link[rel~="icon"]'), lang: document.documentElement.lang,
        liens: [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => /^https?:/.test(h)).map(h => h.split('#')[0]))],
        dcl: Math.round(nav.domContentLoadedEventEnd || 0), octets,
      };
    });
    await page.screenshot({ path: join(SORTIE, `${chemin.replace(/[\/.]/g, '_')}_${largeur}_${theme}.png`), fullPage: true }).catch(() => {});
    console.log(` [${largeur}px ${theme}]`);
    note(r.debordement <= 1, `Pas de défilement horizontal (${r.debordement} px)`);
    note(!r.contraste.length, `Contraste des textes${r.contraste.length ? ' :\n      ' + r.contraste.join('\n      ') : ''}`);
    if(largeur === 1440){
      note(!r.imagesSansAlt.length, `Images avec texte alternatif${r.imagesSansAlt.length ? ' : ' + r.imagesSansAlt.join(', ') : ''}`);
      note(!r.champsSansEtiquette.length, `Champs de formulaire étiquetés${r.champsSansEtiquette.length ? ' : ' + r.champsSansEtiquette.join(', ') : ''}`);
      note(chemin === '404.html' ? !!r.titre && r.icone : !!r.titre && !!r.description && !!r.viewport && r.icone && r.lang === 'fr', `Titre, description, viewport, icône, langue (« ${r.titre} »)`);
      if(chemin !== '404.html') note(!!r.ogImage, 'Image d’aperçu pour les réseaux sociaux');
      console.log(`  ⏱️  4G lente simulée : affichage ${(r.dcl / 1000).toFixed(1)} s, chargement complet ${(tLoad / 1000).toFixed(1)} s, ${Math.round(r.octets / 1024)} Ko transférés`);
      for(const l of r.liens){
        let local = l.startsWith(BASE) ? l : l.replace('https://vehizohjunior.github.io/ecomaz-app/', BASE); if(BASE.includes('localhost') && local.endsWith('/landing/')) local += 'index.html';
        if(BASE.includes('localhost') && /^http:\/\/localhost:5190\/ecomaz-app\//.test(l)) continue; // liens absolus de la page 404 : vérifiés en ligne
        const code = await statutLien(local);
        note(code >= 200 && code < 400, `Lien ${l.replace(BASE, '/')} → ${code || 'injoignable'}`);
      }
    }
    await ctx.close();
  }
}
await navigateur.close();
console.log(`\nRésultat : ${problemes} problème(s). Captures : captures/audit-public/`);
