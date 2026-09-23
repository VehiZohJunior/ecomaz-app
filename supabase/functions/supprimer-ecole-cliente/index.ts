import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseCaller.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profil } = await supabaseCaller.from('profiles').select('role').eq('id', user.id).single();
    if (!profil || profil.role !== 'developpeur') throw new Error('Réservé au rôle développeur');

    const { ecoleId } = await req.json();
    if (!ecoleId) throw new Error('Paramètre manquant : ecoleId');

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // 1) Récupérer tous les comptes de connexion (Auth) liés à cette école
    //    AVANT de supprimer quoi que ce soit (la suppression de l'école
    //    effacera ces lignes profiles par cascade).
    const { data: profilsEcole, error: errProfils } = await supabaseAdmin
      .from('profiles').select('id').eq('ecole_id', ecoleId);
    if (errProfils) throw errProfils;

    // 2) Supprimer l'école : cascade automatique sur toutes les tables
    //    opérationnelles (élèves, notes, comptabilité...) et sur profiles.
    const { error: errEcole } = await supabaseAdmin.from('ecoles').delete().eq('id', ecoleId);
    if (errEcole) throw errEcole;

    // 3) Supprimer les comptes Auth eux-mêmes, pour libérer leurs emails
    //    et ne laisser aucun compte orphelin.
    const echecs: string[] = [];
    for (const p of profilsEcole || []) {
      const { error: errUser } = await supabaseAdmin.auth.admin.deleteUser(p.id);
      if (errUser) echecs.push(p.id);
    }

    return new Response(
      JSON.stringify({ ok: true, comptesSupprimes: (profilsEcole || []).length - echecs.length, echecs }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
