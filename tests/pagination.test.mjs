// EcoMaZ — Test de la lecture par pages (supabase-client.js, pagine) contre un faux serveur plafonné à 1 000 lignes.
// Usage : node tests/pagination.test.mjs supabase-client.js
import { readFileSync } from 'node:fs';
const src = readFileSync(process.argv[2], 'utf8');
const debut = src.indexOf('const PAGE_LIGNES'), fin = src.indexOf('async function dbSelectAll');
const pagine = new Function(src.slice(debut, fin) + '; return pagine;')();
// Faux serveur : 2 350 lignes, plafonné à 1 000 lignes par demande, comme Supabase
function fauxServeur(n, avecId = true){
  const lignes = Array.from({ length: n }, (_, i) => ({ id: String(100000 + ((i * 7919) % n)).padStart(6, '0'), v: i }));
  let demandes = 0;
  const fabrique = () => { const etat = { tri: [] }; const q = {
    order(c){ etat.tri.push(c); return q; },
    range(a, b){ demandes++;
      if(!avecId && etat.tri.includes('id')) return Promise.resolve({ data: null, error: { message: 'column vue.id does not exist' } });
      let r = lignes.slice(); if(etat.tri.includes('id')) r.sort((x, y) => x.id.localeCompare(y.id));
      return Promise.resolve({ data: r.slice(a, Math.min(b + 1, a + 1000)), error: null }); } }; return q; };
  return { fabrique, demandes: () => demandes, lignes };
}
let ok = true; const verif = (c, t) => { console.log((c ? '✅ ' : '❌ ') + t); ok = ok && c; };
for(const n of [0, 5, 999, 1000, 1001, 2350]){
  const f = fauxServeur(n); const { data, error } = await pagine(f.fabrique);
  verif(!error && data.length === n && new Set(data.map(x => x.id)).size === n, `${n} lignes → ${data?.length} reçues, sans doublon (${f.demandes()} demande(s))`);
}
const v = fauxServeur(1500, false); const r = await pagine(v.fabrique);
verif(!r.error && r.data.length === 1500, `Vue sans colonne id : ${r.data?.length} / 1500`);
const ancien = fauxServeur(2350); const sansPage = await ancien.fabrique().range(0, 999999);
console.log(`(Avant le correctif : une seule demande renvoyait ${sansPage.data.length} lignes sur 2350)`);
process.exit(ok ? 0 : 1);
