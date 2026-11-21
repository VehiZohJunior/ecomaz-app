// =====================================================================
// EcoMaZ — Garde-fou avant toute mise en ligne (21/11/2026)
// =====================================================================
// Lancé AUTOMATIQUEMENT par « git push » (crochet .githooks/pre-push) :
// si un contrôle échoue, l'envoi est BLOQUÉ et rien ne part en ligne.
//  1. Syntaxe de chaque fichier JavaScript suivi par git (dont les .min.js).
//  2. Fichiers générés à jour (app.min.js…, enseignant.html) : régénérés puis
//     comparés à ceux qui vont partir.
//  3. sw.js sans marque BOM, et numéro de cache changé si l'application change.
//  4. Démarrage réel des 4 applications dans un navigateur sans interface
//     (base de données coupée) : aucune erreur JavaScript au démarrage.
// Usage manuel : node tools/captures/verifier-avant-envoi.mjs
// =====================================================================
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let echecs = 0;
const note = (ok, t) => { console.log(`${ok ? '  ✅' : '  ❌'} ${t}`); if(!ok) echecs++; };
const git = (...a) => execFileSync('git', a, { cwd: RACINE }).toString();

// 1. Syntaxe
console.log('1. Syntaxe des fichiers JavaScript');
const js = git('ls-files', '*.js', '*.mjs').split('\n').filter(f => f && !f.includes('node_modules') && !f.startsWith('supabase/functions/'));
let fautes = [];
for(const f of js){ const r = spawnSync(process.execPath, ['--check', join(RACINE, f)], { encoding: 'utf8' }); if(r.status !== 0) fautes.push(`${f} : ${(r.stderr.split('\n').find(l => /Error/.test(l)) || 'erreur').trim()}`); }
note(!fautes.length, `${js.length} fichiers vérifiés${fautes.length ? '\n      ' + fautes.join('\n      ') : ''}`);

// 2. Fichiers générés à jour
console.log('2. Fichiers générés à jour');
const generes = ['app.min.js', 'supabase-client.min.js', 'theme.min.js', 'motion.min.js', 'icones.min.js', 'recherche.min.js', 'espace-fixe.min.js', 'enseignant.html'].filter(f => existsSync(join(RACINE, f)));
const python = process.platform === 'win32' ? 'python' : 'python3';
spawnSync(python, ['tools/minifier.py'], { cwd: RACINE, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
spawnSync(python, ['tools/generer_enseignant.py'], { cwd: RACINE, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
const changes = git('status', '--porcelain', '--', ...generes).split('\n').filter(Boolean);
note(!changes.length, changes.length ? `Pas à jour (ils viennent d’être régénérés : ajoutez-les au commit) :\n      ${changes.join('\n      ')}` : 'app.min.js, enseignant.html… correspondent aux sources');

// 3. Service worker
console.log('3. Service worker');
const sw = readFileSync(join(RACINE, 'sw.js'));
note(!(sw[0] === 0xEF && sw[1] === 0xBB && sw[2] === 0xBF), 'sw.js sans marque BOM');
try{
  const distant = git('show', 'origin/main:sw.js');
  const cacheLocal = (sw.toString().match(/CACHE_NAME = '([^']+)'/) || [])[1], cacheDistant = (distant.match(/CACHE_NAME = '([^']+)'/) || [])[1];
  const appChangee = git('diff', '--name-only', 'origin/main', 'HEAD').split('\n').some(f => /\.(html|css|js)$/.test(f) && !f.startsWith('tools/') && !f.startsWith('tests/') && !f.startsWith('supabase/'));
  note(!appChangee || cacheLocal !== cacheDistant, appChangee ? `Numéro de cache : ${cacheDistant} → ${cacheLocal}` : 'Aucun fichier de l’application modifié');
}catch(_e){ console.log('  ⚪ Comparaison avec la version en ligne impossible (pas de origin/main)'); }

// 4. Démarrage réel des applications
console.log('4. Démarrage des applications dans un navigateur');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const serveur = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/')) p += 'index.html';
  const f = join(RACINE, p); if(!f.startsWith(RACINE) || !existsSync(f)){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
}).listen(0);
const port = serveur.address().port;
const { chromium } = await import('playwright-core');
const nav = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' }));
for(const page_ of ['index.html', 'enseignant.html', 'parent.html', 'portier.html']){
  const ctx = await nav.newContext({ serviceWorkers: 'block' });
  await ctx.route('https://hvqtsvpkxffseclsfoun.supabase.co/**', r => r.abort());
  const page = await ctx.newPage(); const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.goto(`http://localhost:${port}/${page_}`, { waitUntil: 'load', timeout: 60000 }).catch(e => erreurs.push('chargement : ' + e.message.split('\n')[0]));
  await page.waitForTimeout(2500);
  const texte = await page.evaluate(() => document.body ? document.body.innerText.trim().length : 0).catch(() => 0);
  note(!erreurs.length && texte > 20, `${page_} démarre sans erreur${erreurs.length ? ' :\n      ' + erreurs.slice(0, 3).join('\n      ') : ''}`);
  await ctx.close();
}
await nav.close(); serveur.close();

console.log(echecs ? `\n⛔ ${echecs} contrôle(s) en échec : ENVOI BLOQUÉ. Rien n’est parti en ligne.` : '\n✅ Tous les contrôles sont passés.');
process.exit(echecs ? 1 : 0);
