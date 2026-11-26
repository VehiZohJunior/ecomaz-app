// =====================================================================
// EcoMaZ — AUDIT AUTOMATIQUE DES CLICS (26/11/2026)
// ---------------------------------------------------------------------
// Sur la VERSION DE DÉMONSTRATION locale (http://localhost:5191 : même
// code que l'application en ligne, base fictive dans le navigateur),
// pour chaque rôle et chaque écran du menu :
//   - ouvre l'écran, puis chaque onglet / filtre (états de l'écran) ;
//   - clique UN PAR UN chaque bouton, lien, élément dépliable (<details>),
//     liste déroulante de l'état, sur un écran remis à neuf à chaque fois ;
//   - note : erreur JavaScript, aucune réaction visible, téléchargement,
//     fenêtre ouverte, changement d'écran, lien externe.
// Aucune donnée réelle : la démo n'a aucun serveur.
// Usage : node tools/audit/audit_clics.mjs [role,...]  → tools/audit/rapport-clics.json
// =====================================================================
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(ICI, '..', 'captures', 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:5191/';
const ROLES = {
  direction: { id: 'demo-direction', page: 'index.html' },
  secretariat: { id: 'demo-secretariat', page: 'index.html' },
  enseignant: { id: 'demo-enseignant', page: 'enseignant.html' },
  parent: { id: 'demo-parent', page: 'parent.html' },
  portier: { id: 'demo-portier', page: 'portier.html' },
};
const roles = (process.argv[2] || Object.keys(ROLES).join(',')).split(',');
const LARGEUR = Number(process.env.LARGEUR || 1280), HAUTEUR = LARGEUR < 600 ? 844 : 860;
const MAX_PAR_ETAT = Number(process.env.MAX || 45);
const attendre = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(ICI, { recursive: true });

// Éléments cliquables d'un conteneur (stables d'un rendu à l'autre)
const LISTER = (racineSel) => {
  const racine = document.querySelector(racineSel) || document.body;
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const els = [...racine.querySelectorAll('button, a[href], summary, select, [onclick], [role="tab"], input[type="checkbox"], input[type="radio"], label.seg')]
    .filter(e => vis(e) && !e.disabled && !e.closest('#demo-pastille, #demo-choix'));
  const uniques = [...new Set(els)].filter(e => !els.some(p => p !== e && p.contains(e) && p.tagName !== 'DETAILS' && p.tagName !== 'FORM' && p.matches('button, a[href], summary')));
  return uniques.map((e, i) => ({ i, tag: e.tagName.toLowerCase(), texte: (e.innerText || e.getAttribute('aria-label') || e.title || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 70),
    onglet: e.matches('[role="tab"], .subtab, .seg, .cn-onglet, .dbr-onglet') , href: e.getAttribute('href') || '', onclick: (e.getAttribute('onclick') || '').slice(0, 90) }));
};

const rapport = { date: new Date().toISOString(), largeur: LARGEUR, roles: {} };
const navigateur = await chromium.launch({ channel: 'msedge' });
for (const role of roles) {
  const R = ROLES[role];
  const ctx = await navigateur.newContext({ viewport: { width: LARGEUR, height: HAUTEUR }, bypassCSP: true, serviceWorkers: 'block', acceptDownloads: true, locale: 'fr-FR',
    permissions: ['geolocation'], geolocation: { latitude: 5.3489, longitude: -3.9897 } });
  await ctx.addInitScript(([id]) => {
    try { localStorage.setItem('ecomaz_demo_utilisateur', id); } catch (_e) {}
    window.__journal = { erreurs: [], fenetres: [] };
    window.addEventListener('error', e => window.__journal.erreurs.push(String(e.message)));
    window.addEventListener('unhandledrejection', e => window.__journal.erreurs.push('promesse : ' + (e.reason && (e.reason.message || e.reason))));
    window.alert = m => window.__journal.fenetres.push('alert: ' + String(m).slice(0, 120));
    window.confirm = m => { window.__journal.fenetres.push('confirm: ' + String(m).slice(0, 120)); return false; };   // jamais d'action destructrice
    window.prompt = () => null;
    window.print = () => window.__journal.fenetres.push('impression');
    window.open = (u) => { window.__journal.fenetres.push('nouvel onglet: ' + String(u).slice(0, 80)); return null; };
  }, [R.id]);
  const page = await ctx.newPage();
  const erreursPage = [];
  page.on('pageerror', e => erreursPage.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource|demo\.invalid/i.test(m.text())) erreursPage.push('console: ' + m.text().slice(0, 160)); });
  let telechargements = [];
  page.on('download', d => telechargements.push(d.suggestedFilename()));
  await page.route(/wa\.me|whatsapp|tel:|mailto:|youtube/, r => r.abort());
  await page.goto(BASE + R.page); await attendre(4000);
  await page.evaluate(() => { try { closeModal(); } catch (_e) {} document.querySelector('#demo-pastille')?.remove(); });
  const vues = await page.evaluate(() => {
    if (['parent', 'portier'].includes(ui.role)) return ['__accueil__'];
    const r = ROLES[ui.role]; const toutes = [...new Set([...document.querySelectorAll('#nav .nav-item[data-view]')].map(b => b.dataset.view))];
    return toutes.filter(v => r.nav === 'all' || r.nav.includes(v));
  });
  const resRole = { vues: {} };
  const remettre = async (vue, etat) => {
    await page.evaluate(([vue, etat]) => {
      try { closeModal(); } catch (_e) {}
      document.querySelectorAll('.bulle-dropdown').forEach(d => d.style.display = 'none'); if (typeof pcBasculer === 'function') pcBasculer(false);
      document.body.classList.remove('centre-ouvert', 'pc-ouvert');
      if (vue !== '__accueil__') { ui.filters = Object.assign(ui.filters || {}, window.__filtresBase ? JSON.parse(window.__filtresBase) : {}); go(vue); }
      else if (typeof rafraichirAccueil === 'function') rafraichirAccueil();
      window.scrollTo(0, 0);
    }, [vue, etat]);
    await attendre(450);
    if (etat != null) {   // ré-ouvrir l'onglet de cet état
      await page.evaluate((i) => { const L = window.__lister('#viewContainer'); }, etat);
      const els = await page.$$('#viewContainer button, #viewContainer a[href], #viewContainer summary, #viewContainer select, #viewContainer [onclick], #viewContainer [role="tab"], #viewContainer input[type="checkbox"], #viewContainer input[type="radio"], #viewContainer label.seg');
      void els;
      await page.evaluate((txt) => { const c = [...document.querySelectorAll('#viewContainer [role="tab"], #viewContainer .subtab, #viewContainer .seg, #viewContainer .dbr-onglet')].find(e => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70) === txt); if (c) c.click(); }, etat);
      await attendre(450);
    }
  };
  await page.evaluate((src) => { window.__lister = eval(src); window.__filtresBase = JSON.stringify(ui.filters || {}); }, `(${LISTER.toString()})`);
  const VUES_FILTRE = (process.env.VUES || '').split(',').filter(Boolean);
  for (const vue of vues.filter(v => !VUES_FILTRE.length || VUES_FILTRE.includes(v))) {
    const resVue = { etats: {}, erreurs: [] };
    await remettre(vue, null);
    const conteneur = '#viewContainer';
    const initiaux = await page.evaluate((c) => window.__lister(c), conteneur);
    const etats = [null, ...[...new Set(initiaux.filter(e => e.onglet).map(e => e.texte))].slice(0, 8)];
    for (const etat of etats) {
      await remettre(vue, etat);
      const liste = (await page.evaluate((c) => window.__lister(c), conteneur)).filter(e => !(etat && e.onglet));
      const resultats = [];
      for (const el of liste.slice(0, MAX_PAR_ETAT)) {
        await remettre(vue, etat);
        await page.evaluate(() => { window.__mut = 0; if (window.__obs) window.__obs.disconnect(); window.__obs = new MutationObserver(l => { window.__mut += l.length; }); window.__obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); });
        const avant = await page.evaluate(() => ({ html: document.body.innerHTML.length + ':' + (document.querySelector('#viewContainer')?.innerHTML.length || 0) + ':' + document.querySelectorAll('details[open]').length + ':' + (document.querySelector('#modalBackdrop.open') ? 1 : 0), vue: ui.currentView, n: window.__journal.erreurs.length, f: window.__journal.fenetres.length }));
        const e0 = erreursPage.length; telechargements = [];
        const cibles = await page.evaluate((c) => window.__lister(c), conteneur);
        const cible = cibles.find(x => x.texte === el.texte && x.tag === el.tag && x.onclick === el.onclick) || cibles[el.i];
        let reaction = '', erreur = '';
        if (!cible) { resultats.push({ ...el, reaction: 'introuvable au 2e rendu' }); continue; }
        try {
          await page.evaluate(([c, idx]) => {
            const racine = document.querySelector(c);
            const tous = [...racine.querySelectorAll('button, a[href], summary, select, [onclick], [role="tab"], input[type="checkbox"], input[type="radio"], label.seg')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') && !e.disabled && !e.closest('#demo-pastille, #demo-choix'); });
            const u = [...new Set(tous)].filter(e => !tous.some(p => p !== e && p.contains(e) && p.tagName !== 'DETAILS' && p.tagName !== 'FORM' && p.matches('button, a[href], summary')));
            const e = u[idx]; if (!e) return;
            if (e.tagName === 'SELECT') { const o = [...e.options].find(o => !o.selected && !o.disabled); if (o) { e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); } return; }
            if (e.tagName === 'A' && /^https?:/.test(e.getAttribute('href') || '') && !e.getAttribute('href').includes(location.host)) { window.__journal.fenetres.push('lien externe: ' + e.getAttribute('href').slice(0, 60)); return; }
            e.scrollIntoView({ block: 'center' }); e.click();
          }, [conteneur, cible.i]);
        } catch (err) { erreur = err.message.split('\n')[0]; }
        await attendre(700);
        const apres = await page.evaluate((n) => ({ mut: window.__mut, html: document.body.innerHTML.length + ':' + (document.querySelector('#viewContainer')?.innerHTML.length || 0) + ':' + document.querySelectorAll('details[open]').length + ':' + (document.querySelector('#modalBackdrop.open') ? 1 : 0),
          vue: ui.currentView, erreurs: window.__journal.erreurs.slice(n.n), fenetres: window.__journal.fenetres.slice(n.f), modal: document.querySelector('#modalBackdrop.open') ? (document.querySelector('#modalTitle')?.textContent || 'fenêtre') : '', url: location.pathname }), avant);
        const errs = [...apres.erreurs, ...erreursPage.slice(e0)];
        if (errs.length) reaction = 'ERREUR';
        else if (telechargements.length) reaction = 'téléchargement : ' + telechargements.join(', ');
        else if (apres.modal) reaction = 'fenêtre : ' + apres.modal;
        else if (apres.vue !== avant.vue) reaction = 'écran : ' + apres.vue;
        else if (apres.fenetres.length) reaction = apres.fenetres.join(' | ');
        else if (apres.url !== '/' + R.page && apres.url !== '/' ) reaction = 'page : ' + apres.url;
        else if (apres.html !== avant.html || apres.mut > 0) reaction = 'change l’écran';
        else reaction = 'AUCUNE RÉACTION';
        resultats.push({ texte: el.texte, tag: el.tag, onclick: el.onclick, reaction, erreurs: errs.slice(0, 3), erreur });
        if (apres.url.indexOf(R.page) === -1 && apres.url !== '/') { await page.goto(BASE + R.page); await attendre(3500); await page.evaluate((src) => { window.__lister = eval(src); try { closeModal(); } catch (_e) {} document.querySelector('#demo-pastille')?.remove(); }, `(${LISTER.toString()})`); }
      }
      resVue.etats[etat || '(écran)'] = resultats;
    }
    resRole.vues[vue] = resVue;
    rapport.roles[role] = resRole; writeFileSync(join(ICI, `rapport-clics-${roles.join("-")}${LARGEUR < 600 ? "-mobile" : ""}.json`), JSON.stringify(rapport, null, 1));
    const tout = Object.values(resVue.etats).flat();
    console.log(`${role} · ${vue} : ${tout.length} clics, ${tout.filter(x => x.reaction === 'ERREUR').length} erreur(s), ${tout.filter(x => x.reaction === 'AUCUNE RÉACTION').length} sans réaction`);
  }
  rapport.roles[role] = resRole;
  await ctx.close();
  writeFileSync(join(ICI, `rapport-clics-${roles.join("-")}${LARGEUR < 600 ? "-mobile" : ""}.json`), JSON.stringify(rapport, null, 1));
}
await navigateur.close();
