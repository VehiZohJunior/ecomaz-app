import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Réservé au compte développeur — la configuration Mobile Money d'une
// école cliente (choix du prestataire, identifiants API) est jugée trop
// technique pour Direction/Fondation (décision du 2026-09-24) et se fait
// désormais exclusivement depuis la Console Développeur. Les identifiants
// eux-mêmes ne sont JAMAIS renvoyés au client, même ici — seulement un
// indicateur "déjà configuré" par champ.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabaseCaller.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profil } = await supabaseCaller.from('profiles').select('role, nom_complet').eq('id', user.id).single();
    if (!profil || profil.role !== 'developpeur') throw new Error('Réservé au compte développeur');

    const { ecoleId, actif, prestataire, identifiants } = await req.json();
    if (!ecoleId) throw new Error('École manquante');

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const enEcriture = actif !== undefined || prestataire !== undefined || identifiants !== undefined;

    if (enEcriture) {
      const { data: existant } = await supabaseAdmin
        .from('paiement_en_ligne_config').select('identifiants').eq('ecole_id', ecoleId).maybeSingle();
      const identifiantsFusionnes = { ...(existant?.identifiants || {}), ...(identifiants || {}) };
      const { error } = await supabaseAdmin.from('paiement_en_ligne_config').upsert({
        ecole_id: ecoleId,
        actif: actif ?? false,
        prestataire: prestataire ?? '',
        identifiants: identifiantsFusionnes,
      }, { onConflict: 'ecole_id' });
      if (error) throw error;

      // Journalisation : jamais les valeurs des identifiants, seulement
      // quels champs ont été touchés lors de cette écriture précise.
      const { data: ecole } = await supabaseAdmin.from('ecoles').select('nom_ecole').eq('id', ecoleId).single();
      await supabaseAdmin.from('journal_console_dev').insert({
        action: 'configuration_paiement_en_ligne',
        ecole_id: ecoleId,
        ecole_nom: ecole?.nom_ecole || '',
        details: { actif, prestataire, champsModifies: Object.keys(identifiants || {}) },
        auteur_id: user.id,
        auteur_nom: profil.nom_complet || '',
      });
    }

    const { data: config } = await supabaseAdmin
      .from('paiement_en_ligne_config').select('*').eq('ecole_id', ecoleId).maybeSingle();
    const ident = config?.identifiants || {};
    const champsConfigures: Record<string, boolean> = {};
    for (const k of Object.keys(ident)) champsConfigures[k] = !!ident[k];

    return new Response(JSON.stringify({
      ok: true,
      actif: config?.actif || false,
      prestataire: config?.prestataire || '',
      champsConfigures,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
