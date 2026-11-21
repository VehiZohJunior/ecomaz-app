// EcoMaZ — Test de la file d'attente hors ligne dans un vrai navigateur (IndexedDB réel).
// Aucun appel au vrai serveur : la connexion Supabase est remplacée par une fausse.
// Usage : node tools/captures/test-file-attente.mjs (aperçu local http://localhost:5190 démarré)
import { chromium } from 'playwright-core';
const nav = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' }));
const page = await (await nav.newContext()).newPage();
await page.route('https://hvqtsvpkxffseclsfoun.supabase.co/**', r => r.abort());
await page.goto('http://localhost:5190/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  const res = [];
  session.ecoleId = 'ecole-test'; session.role = 'enseignant';
  let refuser = true; const journal = [];
  sb.from = (table) => ({
    insert: async (ligne) => { if(table === 'erreurs_client'){ journal.push(ligne.message); return { error: null }; }
      return refuser ? { error: { message: "Appel refusé : votre position n'a pas été vérifiée dans l'établissement." } } : { error: null }; },
  });
  for(const x of await listerFileAttente()) await idbDelete('file_attente', x.id);
  await mettreEnFileAttente('insert', 'presences_eleves', { id: 'p1', eleve_id: 'e1', classe_id: 'c1', statut: 'Présent', date: '2026-11-21' });
  await mettreEnFileAttente('insert', 'depenses', { id: 'd1', libelle: 'Craies', montant: 2000 });
  // 1er envoi : le serveur refuse tout
  await synchroniserFileAttente();
  let l = await listerFileAttente();
  res.push(['Après refus : rien n’est jeté (2 gardés)', l.length === 2]);
  res.push(['Chaque élément porte la raison du refus', l.every(x => x.erreur && x.essais === 1)]);
  res.push(['Le refus est noté une seule fois au journal', journal.length === 2]);
  res.push(['Le bandeau compte 2 refus', compteurFileErreurs === 2]);
  // 2e passage automatique tout de suite : pas de nouvel envoi (attente de 10 minutes)
  await synchroniserFileAttente();
  l = await listerFileAttente();
  res.push(['Pas de nouvel essai automatique avant 10 minutes', l.every(x => x.essais === 1)]);
  // L'utilisateur réessaie, le serveur accepte maintenant
  refuser = false;
  await synchroniserFileAttente(true);
  l = await listerFileAttente();
  res.push(['« Réessayer » : envoyés et retirés de la file', l.length === 0 && compteurFileErreurs === 0]);
  // Abandon volontaire
  refuser = true;
  await mettreEnFileAttente('insert', 'depenses', { id: 'd2', libelle: 'Papier', montant: 1000 });
  await synchroniserFileAttente();
  const id = (await listerFileAttente())[0].id;
  await abandonnerElementFile(id);
  res.push(['« Abandonner » : effacé seulement à la demande, et noté au journal', (await listerFileAttente()).length === 0 && journal.some(m => /Abandonné/.test(m))]);
  return res;
});
let ok = true;
for(const [t, v] of r){ console.log((v ? '✅ ' : '❌ ') + t); ok = ok && v; }
await nav.close();
process.exit(ok ? 0 : 1);
