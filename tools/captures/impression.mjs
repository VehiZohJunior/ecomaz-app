// =====================================================================
// EcoMaZ — Vérification des documents imprimés (vrai rendu PDF A4)
// Données FICTIVES de l'école démo, aucune écriture.
// Usage : node tools/captures/impression.mjs <nom>
// =====================================================================
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');
const [nom = 'impression'] = process.argv.slice(2);
const sortie = join(RACINE, 'captures', nom); mkdirSync(sortie, { recursive: true });
const D = JSON.parse(readFileSync(join(ICI, 'donnees-demo.json'), 'utf8'));
const src = readFileSync(join(ICI, 'capturer.mjs'), 'utf8');
const installer = src.slice(src.indexOf('function installerDemo'), src.indexOf('const navigateur'));
const DOCS = [
  ['bulletins', "imprimerBulletinsClasse(DB.classes[0].id, 'Trimestre 1')"],
  ['recu', "(() => { const p = DB.paiementsScolarite[0], e = eleveById(p.eleveId); openRecu({type:'entree', refId:p.id, montant:p.montant, date:p.date, modePaiement:p.modePaiement, objet:'Scolarité — ' + p.tranche, personne: eleveFullName(e), sousInfo: classeName(e.classeId) + ' · Matricule ' + e.matricule}); })()"],
  ['certificat', "ouvrirCertificatScolarite(DB.eleves[0].id)"],
  ['coupons', "ouvrirCouponsInvitation(false)"],
  ['badges', "ouvrirBadgesQR()"],
  ['affiche', "imprimerAffiche('parent.html')"],
  ['liste', "ouvrirListeClasse(DB.classes[0].id, 'emargement')"],
];
const b = await chromium.launch({ channel: 'msedge', headless: true });
for(const [doc, geste] of DOCS){
  const p = await b.newPage();
  const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto('http://localhost:5190/', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  await p.addScriptTag({ content: installer });
  await p.evaluate(d => installerDemo(d), D);
  try{
    await p.evaluate(async ([eid, g]) => { session.userId = 'x'; session.ecoleId = eid; session.role = 'direction'; ui.role = 'direction';
      VERSIONS.forEach(v => { try{ localStorage.setItem('ecomaz_nouveautes_' + v.version + '_x', '1'); }catch(e){} });
      DB = await chargerDB(); enterApp(); eval(g); }, [D._ecole_id, geste]);
  }catch(e){ erreurs.push(e.message); }
  await p.waitForTimeout(900);
  const f = join(sortie, doc + '.pdf');
  await p.pdf({ path: f, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } });
  const n = (readFileSync(f).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  // Aperçu PNG de la 1re page (rendu « impression »), APRÈS le PDF
  await p.emulateMedia({ media: 'print' }); await p.setViewportSize({ width: 794, height: 1123 });
  await p.screenshot({ path: join(sortie, doc + '-page1.png') });
  console.log(`${doc} : ${n} page(s)${erreurs.length ? ' — ERREUR : ' + erreurs.join(' | ') : ''}`);
  await p.close();
}
await b.close();
