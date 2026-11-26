// =====================================================================
// EcoMaZ — AUDIT DES FORMULAIRES ET DES ENREGISTREMENTS (26/11/2026)
// ---------------------------------------------------------------------
// Sur la démo locale (http://localhost:5191, base fictive, même code que
// l'application) : pour chaque rôle et chaque écran,
//   A. chaque formulaire de l'écran : rempli (valeurs plausibles) puis envoyé ;
//   B. chaque bouton qui ouvre une fenêtre avec des champs : fenêtre remplie,
//      puis bouton principal (Enregistrer, Valider, Ajouter, Publier…) ;
//   C. chaque bouton « Remplissage intelligent » : analyse d'un texte et
//      d'une photo, puis « Appliquer » → les champs de la fiche se remplissent.
// Mesure : écritures faites dans la base fictive (compteur de demo.js),
// message affiché, erreur JavaScript.
// Usage : node tools/audit/audit_formulaires.mjs [role,...]  (env VUES=...)
// =====================================================================
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(ICI, '..', 'captures', 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:5191/';
const ROLES = { direction: ['demo-direction', 'index.html'], secretariat: ['demo-secretariat', 'index.html'], enseignant: ['demo-enseignant', 'enseignant.html'] };
const roles = (process.argv[2] || Object.keys(ROLES).join(',')).split(',');
const VUES_FILTRE = (process.env.VUES || '').split(',').filter(Boolean);
const attendre = ms => new Promise(r => setTimeout(r, ms));
// petite image PNG (1×1) pour l'essai « photo » du remplissage intelligent
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// --- fonctions exécutées dans la page ---
const OUTILS = () => {
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  window.__aud = {
    vis,
    remplir(racine){
      let n = 0; const auj = new Date().toISOString().slice(0, 10);
      racine.querySelectorAll('input, select, textarea').forEach(el => {
        if(!vis(el) || el.disabled || el.readOnly) return;
        const t = (el.type || '').toLowerCase();
        if(['hidden', 'submit', 'button', 'file', 'range', 'color', 'search'].includes(t)) return;
        if(t === 'checkbox'){ if(!el.checked){ el.click(); n++; } return; }
        if(t === 'radio'){ const g = racine.querySelectorAll(`input[type=radio][name="${el.name}"]`); if(![...g].some(r => r.checked)){ el.click(); n++; } return; }
        if(el.tagName === 'SELECT'){ const o = [...el.options].find(o => o.value && !o.disabled); if(o && !el.value){ el.value = o.value; n++; } else if(o && el.options.length > 1 && el.selectedIndex === 0 && !el.options[0].value){ el.value = o.value; n++; } el.dispatchEvent(new Event('change', { bubbles: true })); return; }
        if(el.value && el.value.trim()) return;
        const nom = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.closest('.form-group, label')?.textContent || '')).toLowerCase();
        let v = 'Essai audit';
        if(el.list && el.list.options.length) v = el.list.options[0].value;
        else if(t === 'email') v = 'essai@exemple.ci';
        else if(t === 'tel') v = '0700000001';
        else if(t === 'number'){ const min = Number(el.min || 0), max = el.max ? Number(el.max) : null; v = String(max !== null ? Math.min(max, Math.max(min, 10)) : Math.max(min, 1000)); }
        else if(t === 'date') v = /naissance|né/.test(nom) ? '2019-03-12' : auj;
        else if(/t[ée]l[ée]phone|\btel|whatsapp|num[ée]ro/.test(nom) && t !== 'number') v = '0700000001';
        else if(/e-?mail|courriel/.test(nom)) v = 'essai@exemple.ci';
        else if(/montant|prix|frais|salaire|tarif|co[uû]t/.test(nom) && t !== 'number') v = '25000';
        else if(/heure/.test(nom) && t !== 'time') v = '08:00';
        else if(t === 'time') v = '08:00';
        else if(t === 'month') v = auj.slice(0, 7);
        else if(t === 'datetime-local') v = auj + 'T08:00';
        else if(t === 'url') v = 'https://exemple.ci';
        else if(t === 'password') return;
        if(el.maxLength > 0 && v.length > el.maxLength) v = v.slice(0, el.maxLength);
        if(el.pattern){ try{ if(!new RegExp('^(?:' + el.pattern + ')$').test(v)) v = /\\d/.test(el.pattern) ? '0700000001' : v; }catch(_e){} }
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); n++;
      });
      return n;
    },
    boutonPrincipal(racine){
      const btns = [...racine.querySelectorAll('button, input[type=submit]')].filter(b => vis(b) && !b.disabled);
      return btns.find(b => b.type === 'submit' && !/annuler|fermer|retour/i.test(b.textContent))
        || btns.find(b => /enregistrer|valider|ajouter|cr[ée]er|envoyer|publier|importer|appliquer|confirmer|inscrire|approuver|sauvegarder|programmer/i.test(b.textContent) && !/annuler|fermer|retour|télécharger|imprimer/i.test(b.textContent));
    },
    etat(){ return { e: window.__demoEcritures || 0, t: (window.__demoTables || []).length, err: window.__journal.erreurs.length, toasts: window.__journal.toasts.length }; },
  };
};

const rapport = { date: new Date().toISOString(), roles: {} };
const navigateur = await chromium.launch({ channel: 'msedge' });
for (const role of roles) {
  const [id, pageR] = ROLES[role];
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true, serviceWorkers: 'block', acceptDownloads: true, permissions: ['geolocation'], geolocation: { latitude: 5.3489, longitude: -3.9897 } });
  await ctx.addInitScript(([id]) => {
    if (!sessionStorage.getItem('aud')) { localStorage.clear(); sessionStorage.setItem('aud', '1'); }
    localStorage.setItem('ecomaz_demo_utilisateur', id);
    window.__journal = { erreurs: [], toasts: [] };
    window.addEventListener('error', e => window.__journal.erreurs.push(String(e.message)));
    window.addEventListener('unhandledrejection', e => window.__journal.erreurs.push('promesse : ' + (e.reason && (e.reason.message || e.reason))));
    window.alert = m => window.__journal.toasts.push('alert: ' + String(m).slice(0, 140));
    window.confirm = () => true; window.prompt = () => 'Essai audit'; window.print = () => {}; window.open = () => null; window.close = () => {};
  }, [id]);
  const page = await ctx.newPage();
  page.on('pageerror', e => page.evaluate(m => window.__journal && window.__journal.erreurs.push(m), e.message).catch(() => {}));
  await page.route(/wa\.me|whatsapp|youtube/, r => r.abort());
  const demarrer = async () => {
    await page.goto(BASE + pageR); await attendre(4000);
    await page.evaluate(OUTILS);
    await page.evaluate(() => { try{ closeModal(); }catch(_e){} document.querySelector('#demo-pastille')?.remove();
      const t0 = window.toast; window.toast = function(m){ window.__journal.toasts.push(String(m).slice(0, 160)); return t0.apply(this, arguments); }; });
  };
  await demarrer();
  const vues = (await page.evaluate(() => { const r = ROLES[ui.role]; return [...new Set([...document.querySelectorAll('#nav .nav-item[data-view]')].map(b => b.dataset.view))].filter(v => r.nav === 'all' || r.nav.includes(v)); }))
    .filter(v => !VUES_FILTRE.length || VUES_FILTRE.includes(v));
  const resRole = {};
  const lignes = [];
  const ouvrir = async (vue) => { await page.evaluate((v) => { try{ closeModal(); }catch(_e){} try{ closeSmartFillModal(); }catch(_e){} go(v); window.scrollTo(0, 0); }, vue); await attendre(600); };
  const mesurer = async (avant) => page.evaluate((a) => { const e = window.__aud.etat(); const inval = [...document.querySelectorAll('#modalBackdrop.open :invalid, #viewContainer form :invalid')].filter(x => x.tagName !== 'FORM' && x.tagName !== 'FIELDSET').map(x => (x.name || x.id) + ': ' + x.validationMessage).slice(0, 3); const msgErr = [...document.querySelectorAll('#modalBackdrop.open .pin-error, #modalBackdrop.open [role=alert], #viewContainer .pin-error')].map(x => x.textContent.trim()).filter(Boolean).slice(0, 2); return { invalides: inval, messagesErreur: msgErr, ecritures: e.e - a.e, tables: (window.__demoTables || []).slice(a.t).slice(0, 4), erreurs: window.__journal.erreurs.slice(a.err), messages: window.__journal.toasts.slice(a.toasts).slice(-2), fenetre: document.querySelector('#modalBackdrop.open') ? document.querySelector('#modalTitle')?.textContent : '' }; }, avant);
  for (const vue of vues) {
    if (page.isClosed()) break;
    const res = [];
    try {
      await ouvrir(vue);
      // A. formulaires de l'écran
      const nbForms = await page.evaluate(() => [...document.querySelectorAll('#viewContainer form')].filter(f => window.__aud.vis(f)).length);
      for (let i = 0; i < nbForms; i++) {
        await ouvrir(vue);
        const avant = await page.evaluate(() => window.__aud.etat());
        const info = await page.evaluate((i) => {
          const f = [...document.querySelectorAll('#viewContainer form')].filter(f => window.__aud.vis(f))[i]; if (!f) return null;
          const titre = (f.querySelector('h2,h3,h4,legend,label')?.textContent || f.id || 'formulaire').replace(/\s+/g, ' ').trim().slice(0, 60);
          const n = window.__aud.remplir(f); const b = window.__aud.boutonPrincipal(f);
          if (b) b.click(); else if (f.requestSubmit) f.requestSubmit();
          return { titre, champs: n, bouton: b ? b.textContent.trim().slice(0, 40) : '(envoi)' };
        }, i);
        if (!info) continue;
        await attendre(1200);
        res.push({ type: 'formulaire de l’écran', ...info, ...(await mesurer(avant)) });
      }
      // B. boutons qui ouvrent une fenêtre avec des champs ; C. remplissage intelligent
      const boutons = await page.evaluate(() => [...document.querySelectorAll('#viewContainer button, #viewContainer [onclick]')].filter(b => window.__aud.vis(b) && !b.closest('form')).map((b, i) => ({ i, texte: (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60), oc: (b.getAttribute('onclick') || '').slice(0, 80) })));
      for (const bt of boutons.slice(0, Number(process.env.MAX || 60))) {
        if (/supprimer|retirer|effacer|déconnexion|changer de fonction|vider|réinitialiser/i.test(bt.texte + bt.oc)) continue;
        await ouvrir(vue);
        const avant = await page.evaluate(() => window.__aud.etat());
        const ouvert = await page.evaluate((bt) => {
          const b = [...document.querySelectorAll('#viewContainer button, #viewContainer [onclick]')].filter(b => window.__aud.vis(b) && !b.closest('form')).find(b => (b.getAttribute('onclick') || '').slice(0, 80) === bt.oc && (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60) === bt.texte);
          if (!b) return 'introuvable'; b.click(); return 'ok';
        }, bt);
        if (ouvert !== 'ok') continue;
        await attendre(900);
        const sf = await page.evaluate(() => document.querySelector('#smartFillBackdrop.open') ? true : false);
        if (sf) {   // C. remplissage intelligent : texte puis photo
          const avantChamps = await page.evaluate(() => document.querySelectorAll('form input, form select, form textarea').length);
          await page.fill('#smartFillTexte', 'Inscription de Awa KOUASSI, fille, née le 12 mars 2019, classe CP1. Maman : Mme Kouassi Ama, 07 00 00 00 01.').catch(() => {});
          await page.evaluate(() => handleSmartFillTexte()); await attendre(1500);
          const apercu = await page.evaluate(() => !!document.querySelector('#smartFillBody [onclick="appliquerSmartFill()"]'));
          let rempli = 0;
          if (apercu) { const vides0 = await page.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(e => e.value).length); await page.evaluate(() => appliquerSmartFill()); await attendre(700); rempli = (await page.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(e => e.value).length)) - vides0; }
          // photo
          let photo = '';
          await page.evaluate(() => { try{ closeSmartFillModal(); }catch(_e){} });
          await ouvrir(vue);
          await page.evaluate((bt) => { const b = [...document.querySelectorAll('#viewContainer button, #viewContainer [onclick]')].filter(b => window.__aud.vis(b) && !b.closest('form')).find(b => (b.getAttribute('onclick') || '').slice(0, 80) === bt.oc && (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60) === bt.texte); b && b.click(); }, bt);
          await attendre(700);
          const input = await page.$('#smartFillBody input[type=file][accept^="image"]');
          if (input) { await input.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG }); await attendre(2500); photo = (await page.evaluate(() => !!document.querySelector('#smartFillBody [onclick="appliquerSmartFill()"]'))) ? 'aperçu OK' : 'pas d’aperçu : ' + (await page.evaluate(() => document.querySelector('#smartFillBody .pin-error')?.textContent || '')).slice(0, 80); }
          await page.evaluate(() => { try{ closeSmartFillModal(); }catch(_e){} });
          res.push({ type: 'remplissage intelligent', titre: bt.texte, texte: apercu ? 'aperçu OK' : 'pas d’aperçu', champsRemplis: rempli, photo, ...(await mesurer(avant)) });
          continue;
        }
        const modal = await page.evaluate(() => { const m = document.querySelector('#modalBackdrop.open #modalBody'); if (!m) return null; const champs = [...m.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')].filter(e => window.__aud.vis(e)).length; return { champs, titre: document.querySelector('#modalTitle')?.textContent.trim().slice(0, 60) }; });
        if (!modal || !modal.champs) continue;
        const info = await page.evaluate(() => { const m = document.querySelector('#modalBackdrop.open #modalBody'); const n = window.__aud.remplir(m); const b = window.__aud.boutonPrincipal(m); if (b) b.click(); return { rempli: n, bouton: b ? b.textContent.trim().slice(0, 40) : '' }; });
        if (!info.bouton) { res.push({ type: 'fenêtre', titre: modal.titre, depuis: bt.texte, champs: modal.champs, bouton: '(aucun bouton d’enregistrement : fenêtre de consultation ou de choix)' }); continue; }
        await attendre(1300);
        res.push({ type: 'fenêtre', titre: modal.titre, depuis: bt.texte, champs: modal.champs, bouton: info.bouton, ...(await mesurer(avant)) });
      }
    } catch (e) {
      res.push({ type: 'ARRÊT', titre: e.message.split('\n')[0] });
      if (page.isClosed()) break;
      try { await demarrer(); } catch (_e) {}
    }
    resRole[vue] = res;
    const ok = res.filter(r => r.ecritures > 0).length, err = res.filter(r => (r.erreurs || []).length).length;
    lignes.push(`${role} · ${vue} : ${res.length} essai(s), ${ok} enregistrement(s), ${err} erreur(s)`);
    console.log(lignes[lignes.length - 1]);
    rapport.roles[role] = resRole;
    writeFileSync(join(ICI, `rapport-formulaires-${roles.join('-')}.json`), JSON.stringify(rapport, null, 1));
  }
  await ctx.close();
}
await navigateur.close();
