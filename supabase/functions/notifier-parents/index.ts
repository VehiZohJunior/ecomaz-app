// =====================================================================
// EcoMaZ — Fonction Edge : notification push aux parents de certains élèves
// =====================================================================
// Appelée par l'application de l'école après un message aux parents, une
// réponse « objet perdu » ou un message du renforcement. Réservée au
// personnel administratif (secrétariat / direction / fondation) ; seuls les
// élèves de SON école sont pris en compte. Le contenu est déjà enregistré
// dans l'application : la notification ne fait que prévenir le téléphone.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envoyerPush, parentsDesEleves } from '../_shared/push.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');
    const url = Deno.env.get('SUPABASE_URL')!;
    const appelant = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await appelant.auth.getUser();
    if (!user) throw new Error('Non authentifié');
    const { data: profil } = await appelant.from('profiles').select('role, ecole_id').eq('id', user.id).single();
    if (!profil?.ecole_id || !['secretariat', 'direction', 'fondation'].includes(profil.role)) throw new Error('Réservé au personnel administratif');

    const { eleveIds, texte } = await req.json();
    if (!Array.isArray(eleveIds) || !eleveIds.length || typeof texte !== 'string' || !texte.trim()) throw new Error('Paramètres manquants');

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Ne garder que des élèves de l'école de l'appelant
    const { data: eleves } = await admin.from('eleves').select('id').eq('ecole_id', profil.ecole_id).in('id', eleveIds.slice(0, 500));
    const { data: ecole } = await admin.from('ecoles').select('nom_ecole').eq('id', profil.ecole_id).single();
    const parents = await parentsDesEleves(admin, profil.ecole_id, (eleves || []).map((e: { id: string }) => e.id));
    const r = await envoyerPush(admin, parents, { title: ecole?.nom_ecole || 'EcoMaZ', body: texte.trim().slice(0, 300), url: './parent.html', tag: 'message-' + Date.now() });
    return json({ ok: true, parents: parents.length, ...r });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});
