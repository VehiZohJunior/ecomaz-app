// =====================================================================
// EcoMaZ — Fonction Edge : notification push à l'enseignant quand le
// portier signale l'arrivée d'un parent
// =====================================================================
// Appelée par l'application PORTIER juste après son signalement. Réservée
// au compte portier. Retrouve le signalement qu'il vient de faire (moins de
// 2 minutes) puis prévient les enseignants de la classe de l'élève — et les
// comptes enseignants « partagés » (non reliés à une fiche), qui voient
// toutes les classes. Le portier n'apprend rien de plus que ce qu'il sait.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envoyerPush } from '../_shared/push.ts';

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
    if (!profil?.ecole_id || profil.role !== 'portier') throw new Error('Réservé au portier');

    const { eleveId } = await req.json();
    if (!eleveId) throw new Error('Paramètres manquants');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const depuis = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: notif } = await admin.from('notifications_portier').select('eleve_nom, classe_id')
      .eq('ecole_id', profil.ecole_id).eq('eleve_id', eleveId).eq('created_by', user.id).gte('created_at', depuis)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!notif) throw new Error('Signalement introuvable');

    // Enseignants concernés : ceux de la classe + comptes enseignants non reliés à une fiche
    const { data: comptes } = await admin.from('profiles').select('id, enseignant_id').eq('ecole_id', profil.ecole_id).eq('role', 'enseignant');
    const ficheIds = (comptes || []).map((c: { enseignant_id: string | null }) => c.enseignant_id).filter(Boolean);
    const { data: fiches } = ficheIds.length
      ? await admin.from('enseignants').select('id, classes_assignees').in('id', ficheIds)
      : { data: [] };
    const classesDe: Record<string, string[]> = {};
    (fiches || []).forEach((f: { id: string; classes_assignees: string[] | null }) => { classesDe[f.id] = f.classes_assignees || []; });
    const cibles = (comptes || []).filter((c: { enseignant_id: string | null }) =>
      !c.enseignant_id || (classesDe[c.enseignant_id] || []).includes(notif.classe_id)).map((c: { id: string }) => c.id);

    const r = await envoyerPush(admin, cibles, {
      title: '🚪 Un parent est à la porte', body: `Le parent de ${notif.eleve_nom} est arrivé au portail.`,
      url: './index.html', tag: `portier-${eleveId}`,
    });
    return json({ ok: true, enseignants: cibles.length, ...r });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});
