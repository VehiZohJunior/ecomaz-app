// =====================================================================
// EcoMaZ — Vidéos d'utilisation (26/11/2026)
// ---------------------------------------------------------------------
// Pour chaque rôle de scenes.mjs : voix off (synthèse vocale Windows,
// voix française, gratuite et hors ligne) + captures du guide → une vidéo
// MP4 verticale (format téléphone, lisible dans WhatsApp), sous-titrée
// (beaucoup regardent sans le son). Le montage est fait par Microsoft
// Edge lui-même (dessin sur un canevas + enregistreur du navigateur) :
// aucun logiciel à installer.
// Usage : node tools/guide/faire_videos.mjs [role,...] [dossier de sortie]
// Prérequis : node tools/guide/capturer_guide.mjs (captures à jour).
// =====================================================================
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(ICI, '..', 'captures', 'package.json'));
const { chromium } = require('playwright-core');
const roles = (process.argv[2] || Object.keys(SCENES).join(',')).split(',');
const SORTIE = process.argv[3] || join(ICI, 'videos');
mkdirSync(SORTIE, { recursive: true });

// Prononciation de la voix de synthèse (le texte affiché, lui, reste inchangé)
const dire = t => t.replace(/EcoMaZ/g, 'Écomaze').replace(/↔/g, ' et ').replace(/ — /g, ', ').replace(/’/g, "'");

const navigateur = await chromium.launch({ channel: 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
for (const role of roles) {
  const def = SCENES[role];
  const dossierVoix = join(ICI, 'voix', role);
  mkdirSync(dossierVoix, { recursive: true });
  // 1. Plan de la vidéo : ouverture, écrans, fin
  const plan = [
    { type: 'titre', titre: `Guide express — ${def.titre}`, sous: def.intro, voix: def.intro },
    ...def.scenes.map((sc, i) => ({ type: 'ecran', titre: sc.titre, sous: sc.voix, voix: sc.voix, image: join(ICI, 'captures', role, `${String(i + 1).padStart(2, '0')}-${sc.nom}.png`), numero: i + 1, total: def.scenes.length })),
    { type: 'fin', titre: 'Une question ?', sous: 'Touchez 👥 en haut de l’écran et écrivez à un collègue ou à la direction.', voix: 'Une question ? Touchez Personnes connectées et écrivez à la direction. Bon travail avec EcoMaZ !' },
  ];
  // 2. Voix off
  const liste = plan.map((p, i) => ({ texte: dire(p.voix), fichier: join(dossierVoix, `${String(i).padStart(2, '0')}.wav`) }));
  const fichierListe = join(dossierVoix, 'liste.json');
  writeFileSync(fichierListe, JSON.stringify(liste), 'utf8');
  console.log(`${role} : ` + execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ICI, 'voix.ps1'), fichierListe]).toString().trim());
  const donnees = plan.map((p, i) => ({ ...p, image: p.image && existsSync(p.image) ? 'data:image/png;base64,' + readFileSync(p.image).toString('base64') : null,
    son: readFileSync(liste[i].fichier).toString('base64') }));

  // 3. Montage et enregistrement dans Edge
  const page = await navigateur.newPage();
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#000"><canvas id="c" width="720" height="1280"></canvas></body></html>`);
  const b64 = await page.evaluate(async ({ donnees, couleur, roleTitre }) => {
    const W = 720, H = 1280, cv = document.getElementById('c'), g = cv.getContext('2d');
    const ac = new AudioContext(); await ac.resume();
    const dest = ac.createMediaStreamDestination();
    const charger = src => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; });
    for (const d of donnees) {
      const bin = Uint8Array.from(atob(d.son), c => c.charCodeAt(0)).buffer;
      d.buf = await ac.decodeAudioData(bin);
      d.img = d.image ? await charger(d.image) : null;
    }
    const MARGE = 0.2, PAUSE = 0.4;        // silence avant / après chaque phrase (secondes)
    let t = 0; for (const d of donnees) { d.debut = t; d.duree = MARGE + d.buf.duration + PAUSE; t += d.duree; }
    const total = t;
    const NAVY = '#0b1f3a', MENTHE = '#3ddc97';
    const arrondi = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const lignes = (texte, police, largeur) => { g.font = police; const mots = texte.split(' '), out = []; let l = ''; for (const m of mots) { const e = l ? l + ' ' + m : m; if (g.measureText(e).width > largeur && l) { out.push(l); l = m; } else l = e; } if (l) out.push(l); return out; };
    const fond = () => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, NAVY); gr.addColorStop(1, '#122d52'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.globalAlpha = .18; g.fillStyle = couleur; g.beginPath(); g.arc(W + 40, -60, 330, 0, 7); g.fill(); g.globalAlpha = 1; };
    const marque = () => { g.fillStyle = '#fff'; g.font = '800 30px "Segoe UI", sans-serif'; g.textBaseline = 'middle'; g.fillText('EcoMaZ', 40, 62);
      g.font = '700 20px "Segoe UI", sans-serif'; const w = g.measureText(roleTitre).width + 32; arrondi(W - 40 - w, 44, w, 38, 19); g.fillStyle = couleur; g.fill(); g.fillStyle = '#fff'; g.fillText(roleTitre, W - 40 - w + 16, 63); };
    function dessinerScene(d, tl, alpha) {
      g.globalAlpha = alpha;
      if (d.type === 'ecran') {
        const z = 1 + 0.035 * Math.min(1, tl / d.duree);
        const ph = 800, pw = Math.round(ph * d.img.width / d.img.height), px = (W - pw) / 2, py = 112;
        g.save(); g.translate(W / 2, py + ph / 2); g.scale(z, z); g.translate(-W / 2, -(py + ph / 2));
        g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 40; g.shadowOffsetY = 14;
        arrondi(px - 10, py - 10, pw + 20, ph + 20, 42); g.fillStyle = '#e8edf5'; g.fill(); g.shadowColor = 'transparent';
        g.save(); arrondi(px, py, pw, ph, 32); g.clip(); g.drawImage(d.img, px, py, pw, ph); g.restore(); g.restore();
        // numéro + titre + sous-titre
        g.textBaseline = 'alphabetic';
        g.fillStyle = MENTHE; g.font = '800 22px "Segoe UI", sans-serif'; g.fillText(`ÉTAPE ${d.numero} / ${d.total}`, 48, 980);
        g.fillStyle = '#fff'; let y = 1022; for (const l of lignes(d.titre, '800 38px "Segoe UI", sans-serif', W - 96)) { g.fillText(l, 48, y); y += 46; }
        g.fillStyle = 'rgba(255,255,255,.86)'; y += 6; for (const l of lignes(d.sous, '500 25px "Segoe UI", sans-serif', W - 96).slice(0, 5)) { g.fillText(l, 48, y); y += 34; }
      } else {
        g.textBaseline = 'alphabetic'; g.textAlign = 'center';
        g.fillStyle = MENTHE; g.beginPath(); g.arc(W / 2, 430, 86, 0, 7); g.fill();
        g.fillStyle = NAVY; g.font = '800 72px "Segoe UI Emoji", "Segoe UI", sans-serif'; g.fillText(d.type === 'fin' ? '👥' : '🎓', W / 2, 458);
        g.fillStyle = '#fff'; let y = 610; for (const l of lignes(d.titre, '800 52px "Segoe UI", sans-serif', W - 120)) { g.fillText(l, W / 2, y); y += 62; }
        g.fillStyle = 'rgba(255,255,255,.88)'; y += 18; for (const l of lignes(d.sous, '500 30px "Segoe UI", sans-serif', W - 140)) { g.fillText(l, W / 2, y); y += 42; }
        g.textAlign = 'left';
      }
      g.globalAlpha = 1;
    }
    // Enregistrement
    const flux = cv.captureStream(30);
    dest.stream.getAudioTracks().forEach(tr => flux.addTrack(tr));
    const type = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2') ? 'video/mp4;codecs=avc1.42E01E,mp4a.40.2' : 'video/webm;codecs=vp9,opus';
    const rec = new MediaRecorder(flux, { mimeType: type, videoBitsPerSecond: 1_100_000, audioBitsPerSecond: 96_000 });
    const morceaux = []; rec.ondataavailable = e => e.data.size && morceaux.push(e.data);
    const fini = new Promise(r => rec.onstop = r);
    const t0 = ac.currentTime + 0.3;
    for (const d of donnees) { const s = ac.createBufferSource(); s.buffer = d.buf; s.connect(dest); s.start(t0 + d.debut + MARGE); }
    rec.start(250);
    await new Promise(resolve => {
      const image = () => {
        const tc = ac.currentTime - t0;
        fond(); marque();
        const i = Math.max(0, donnees.findIndex(d => tc >= d.debut && tc < d.debut + d.duree));
        const d = donnees[tc >= total ? donnees.length - 1 : i], tl = tc - d.debut, FONDU = 0.35;
        if (i > 0 && tl < FONDU && tc < total) { dessinerScene(donnees[i - 1], donnees[i - 1].duree, 1 - tl / FONDU); dessinerScene(d, Math.max(0, tl), tl / FONDU); }
        else dessinerScene(d, Math.max(0, tl), 1);
        // barre de progression
        g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, H - 8, W, 8); g.fillStyle = MENTHE; g.fillRect(0, H - 8, W * Math.min(1, Math.max(0, tc) / total), 8);
        if (tc >= total + 0.4) return resolve();
        requestAnimationFrame(image);
      };
      image();
    });
    rec.stop(); await fini;
    const blob = new Blob(morceaux, { type: type.split(';')[0] });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), type, duree: total };
  }, { donnees, couleur: def.couleur, roleTitre: def.titre });
  const ext = b64.type.startsWith('video/mp4') ? 'mp4' : 'webm';
  const fichier = join(SORTIE, `EcoMaZ-video-${role}.${ext}`);
  writeFileSync(fichier, Buffer.from(b64.b64, 'base64'));
  console.log(`  → ${fichier} (${Math.round(b64.duree)} s, ${Math.round(Buffer.byteLength(b64.b64, 'base64') / 1024)} Ko)`);
  await page.close();
}
await navigateur.close();
