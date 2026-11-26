// =====================================================================
// EcoMaZ — Guides d'utilisation PDF, un par public (26/11/2026)
// Enseignants / Secrétariat / Direction et Fondation : une page « Pour
// tout le monde », puis chaque geste avec sa capture d'écran (téléphone)
// et ses étapes. QR code vers la vidéo d'une minute du même public.
// Source du contenu : scenes.mjs. Rendu PDF : Microsoft Edge (gratuit).
// Usage : node tools/guide/faire_guide.mjs [role,...]
// =====================================================================
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');
const require = createRequire(join(ICI, '..', 'captures', 'package.json'));
const { chromium } = require('playwright-core');
const SORTIE = join(RACINE, 'docs', 'guide-utilisation');
mkdirSync(SORTIE, { recursive: true });
const SITE = 'https://vehizohjunior.github.io/ecomaz-app/docs/guide-utilisation/';
const FICHIERS = { enseignant: 'EcoMaZ-Guide-Enseignants', secretariat: 'EcoMaZ-Guide-Secretariat', direction: 'EcoMaZ-Guide-Direction-Fondation' };
const roles = (process.argv[2] || Object.keys(SCENES).join(',')).split(',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Les noms de menus et de boutons entre guillemets typographiques sont mis en valeur
const valoriser = s => esc(s).replace(/(Menu|Touchez|Choisissez)\s→/g, '$1 →').replace(/→ ([^.,:;()]+?)(?=[.,:;]|$| \()/g, '→ <b>$1</b>');

const POUR_TOUS = [
  ['Se connecter', ['Ouvrez le lien de l’application de l’école (donné par la direction) dans Chrome (Android) ou Safari (iPhone).', 'Choisissez votre espace, puis votre e-mail et votre mot de passe (ou « Continuer avec Google »).', 'Première connexion : choisissez votre mot de passe personnel (10 caractères au moins, lettres et chiffres). Ne le donnez à personne.']],
  ['L’avoir sur l’écran d’accueil', ['Menu → <b>Installer l’application</b>.', 'iPhone : bouton Partager → <b>Sur l’écran d’accueil</b>.']],
  ['Être prévenu', ['Tableau de bord → <b>Activer les notifications sur ce téléphone</b> → <b>Autoriser</b>.']],
  ['Petits secrets', ['🔍 La loupe en haut retrouve un élève ou une page en quelques lettres.', '<b>Aa</b> agrandit le texte.', 'Sans internet ? Continuez : vos saisies partent dès que la connexion revient.', 'Pour quitter : <b>Déconnexion</b> en bas du menu. Après 10 minutes sans rien toucher, l’application se verrouille.']],
];

const navigateur = await chromium.launch({ channel: 'msedge' });
for (const role of roles) {
  const def = SCENES[role];
  const video = SITE + `EcoMaZ-video-${role}.mp4`;
  const img = (i, nom) => 'data:image/png;base64,' + readFileSync(join(ICI, 'captures', role, `${String(i + 1).padStart(2, '0')}-${nom}.png`)).toString('base64');
  const etapesHtml = def.scenes.map((sc, i) => `
    <section class="geste">
      <img class="ecran" src="${img(i, sc.nom)}" alt="">
      <div class="texte">
        <div class="num">${i + 1}</div>
        <h2>${esc(sc.titre)}</h2>
        <ol>${sc.etapes.map(e => `<li>${valoriser(e)}</li>`).join('')}</ol>
      </div>
    </section>`).join('');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>EcoMaZ — Guide ${esc(def.titre)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
  <style>
    @page{ size:A4; margin:12mm 14mm; }
    *{ box-sizing:border-box; }
    body{ margin:0; font-family:Nunito, "Segoe UI", sans-serif; color:#0b1f3a; font-size:11.5pt; line-height:1.45; }
    .couverture{ background:#0b1f3a; color:#fff; border-radius:6mm; padding:7mm 10mm; position:relative; overflow:hidden; margin-bottom:7mm; }
    .couverture::after{ content:''; position:absolute; right:-30mm; top:-30mm; width:90mm; height:90mm; border-radius:50%; background:${def.couleur}; opacity:.35; }
    .couverture .marque{ font-weight:900; font-size:15pt; letter-spacing:.3px; }
    .couverture h1{ margin:3mm 0 2mm; font-size:24pt; line-height:1.1; font-weight:900; }
    .couverture p{ margin:0; font-size:12.5pt; opacity:.92; max-width:120mm; }
    .puce{ display:inline-block; background:${def.couleur}; color:#fff; font-weight:800; border-radius:99px; padding:1mm 4mm; font-size:10pt; margin-top:4mm; position:relative; z-index:1; }
    .video{ display:flex; gap:5mm; align-items:center; border:1.2pt solid #3ddc97; background:#ecfbf4; border-radius:4mm; padding:3mm 5mm; margin-bottom:5mm; break-inside:avoid; }
    .video .qr{ width:27mm; height:27mm; flex:0 0 27mm; } .video .qr svg, .video .qr img{ width:100%; height:100%; }
    .video strong{ font-size:13pt; } .video p{ margin:1mm 0 0; font-size:10pt; color:#334a66; word-break:break-all; }
    h3.titre{ font-size:14pt; margin:0 0 3mm; font-weight:900; }
    .tous{ display:grid; grid-template-columns:1fr 1fr; gap:3mm; break-inside:avoid; }
    .tous .bloc{ border:1pt solid #d8e0ea; border-radius:3.5mm; padding:3mm 3.5mm; break-inside:avoid; }
    .tous h4{ margin:0 0 1.5mm; font-size:11.5pt; font-weight:900; }
    .tous ul{ margin:0; padding-left:4.5mm; font-size:10pt; line-height:1.38; } .tous li{ margin:.6mm 0; }
    .gestes{ break-before:page; }
    .geste{ display:flex; gap:7mm; align-items:flex-start; padding:3mm 0; border-bottom:1pt solid #e3e8ef; break-inside:avoid; }
    .geste:last-child{ border-bottom:0; }
    .ecran{ width:35mm; flex:0 0 35mm; border-radius:4mm; border:1.5pt solid #0b1f3a; box-shadow:0 1.5mm 4mm rgba(11,31,58,.18); }
    .texte{ flex:1; position:relative; padding-top:1mm; }
    .num{ width:10mm; height:10mm; border-radius:50%; background:${def.couleur}; color:#fff; font-weight:900; font-size:13pt; display:flex; align-items:center; justify-content:center; margin-bottom:2mm; }
    .texte h2{ margin:0 0 2mm; font-size:15pt; line-height:1.2; font-weight:900; }
    .texte ol{ margin:0; padding-left:5mm; } .texte li{ margin:1.6mm 0; }
    b{ font-weight:800; background:#e6f7ef; border-radius:1mm; padding:0 .6mm; }
    .pied{ margin-top:6mm; font-size:9.5pt; color:#5a6b80; text-align:center; }
  </style></head><body>
    <div class="couverture"><div class="marque">EcoMaZ</div><h1>Guide express<br>${esc(def.titre)}</h1><p>${esc(def.intro.replace('en une minute', 'en quelques pages'))} Les écrans montrés sont ceux d’une école exemple : votre école apparaît à leur place.</p><span class="puce">Mis à jour le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
    <div class="video"><div class="qr" id="qr"></div><div><strong>▶ La vidéo d’une minute</strong><p>Scannez le code avec l’appareil photo du téléphone, ou ouvrez :<br>${esc(video)}</p></div></div>
    <h3 class="titre">Pour tout le monde</h3>
    <div class="tous">${POUR_TOUS.map(([t, l]) => `<div class="bloc"><h4>${t}</h4><ul>${l.map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('')}</div>
    <div class="gestes"><h3 class="titre">Les gestes essentiels — ${esc(def.titre)}</h3>${etapesHtml}</div>
    <div class="pied">Une question ? Touchez 👥 en haut de l’écran et écrivez à la direction. — EcoMaZ</div>
    <script>try{ const q = qrcode(0, 'M'); q.addData(${JSON.stringify(video)}); q.make(); document.getElementById('qr').innerHTML = q.createSvgTag({ scalable: true, margin: 0 }); }catch(e){ document.getElementById('qr').textContent = ''; }</script>
  </body></html>`;
  const page = await navigateur.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fichier = join(SORTIE, FICHIERS[role] + '.pdf');
  await page.pdf({ path: fichier, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '14mm', right: '14mm' } });
  console.log('  → ' + fichier);
  await page.close();
}
await navigateur.close();
