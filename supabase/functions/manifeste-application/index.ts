// =====================================================================
// EcoMaZ — Fonction Edge PUBLIQUE : manifeste d'installation des
// applications PARENTS D'ELEVES et PORTIER de chaque école.
// =====================================================================
// Pourquoi côté serveur : sur Android, Chrome fait fabriquer une vraie
// application (WebAPK) par les serveurs de Google, qui doivent pouvoir
// télécharger le manifeste. Un manifeste fabriqué dans le téléphone
// (adresse « blob: ») n'est pas accessible de l'extérieur : l'installation
// échouait ou se réduisait à un simple raccourci.
// Appel : .../manifeste-application?espace=parent|portier&ecole=<uuid>
// Ne renvoie que le nom public de l'école (déjà visible sur l'écran de
// connexion, vue ecoles_vitrine). Déployée avec --no-verify-jwt.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE = 'https://vehizohjunior.github.io/ecomaz-app/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/manifest+json; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  const url = new URL(req.url);
  const demande = url.searchParams.get('espace');
  const espace = demande === 'portier' ? 'portier' : demande === 'enseignant' ? 'enseignant' : 'parent';
  const ecoleId = url.searchParams.get('ecole') || '';

  let nomEcole = '';
  if (UUID.test(ecoleId)) {
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { data } = await sb.from('ecoles_vitrine').select('nom_ecole').eq('id', ecoleId).maybeSingle();
      nomEcole = data?.nom_ecole || '';
    } catch (_e) { /* nom générique */ }
  }

  const page = `${espace}.html`;
  const nom = espace === 'parent'
    ? `EcoMaZ-PARENTS D'ELEVES${nomEcole ? ' ' + nomEcole : ''}`
    : espace === 'enseignant' ? `EcoMaZ-ENSEIGNANTS${nomEcole ? ' ' + nomEcole : ''}`
    : `EcoMaZ-PORTIER${nomEcole ? ' ' + nomEcole : ''}`;
  const suffixe = UUID.test(ecoleId) ? `?ecole=${ecoleId}` : '';
  const manifeste = {
    id: `${SITE}${page}${suffixe}`,
    name: nom,
    short_name: nom,
    description: `Espace ${espace === 'parent' ? 'parents' : espace === 'enseignant' ? 'enseignants' : 'portier'}${nomEcole ? ' — ' + nomEcole : ''}`,
    start_url: `${SITE}${page}${suffixe}`,
    scope: SITE,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#14392d',
    orientation: 'portrait-primary',
    lang: 'fr',
    icons: [
      { src: `${SITE}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${SITE}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${SITE}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifeste), { headers: ENTETES });
});
