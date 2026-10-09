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

    const { data: profil } = await supabaseCaller.from('profiles').select('role, nom_complet').eq('id', user.id).single();
    if (!profil || profil.role !== 'developpeur') throw new Error('Réservé au rôle développeur');

    const { ecoleId } = await req.json();
    if (!ecoleId) throw new Error('Paramètre manquant : ecoleId');

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // 0) Capturer le nom AVANT suppression — le journal doit rester lisible
    //    même après coup (ecole_id passera à NULL par la suite).
    const { data: ecoleAvant } = await supabaseAdmin.from('ecoles').select('nom_ecole').eq('id', ecoleId).single();
    const nomEcole = ecoleAvant?.nom_ecole || '(école inconnue)';

    // 1) Récupérer tous les comptes de connexion (Auth) liés à cette école
    //    AVANT de supprimer quoi que ce soit (la suppression de l'école
    //    effacera ces lignes profiles par cascade).
    const { data: profilsEcole, error: errProfils } = await supabaseAdmin
      .from('profiles').select('id').eq('ecole_id', ecoleId);
    if (errProfils) throw errProfils;

    // 1ter) Comptes Google (parents/portier) qui ont seulement DÉPOSÉ une
    //    demande d'accès : ils n'ont pas de profil, donc pas dans la liste
    //    ci-dessus, mais leur email et leur nom resteraient dans Auth une fois
    //    l'école supprimée. On les repère maintenant (la cascade effacera les
    //    demandes elles-mêmes).
    const { data: demandesEcole } = await supabaseAdmin
      .from('demandes_acces').select('user_id').eq('ecole_id', ecoleId);
    const idsDemandeurs = Array.from(new Set((demandesEcole || []).map((d: { user_id: string }) => d.user_id)));

    // 1bis) Journaliser AVANT la suppression, pendant que ecoleId est
    //    encore une référence valide — la contrainte "on delete set null"
    //    videra automatiquement ecole_id ici une fois l'école supprimée
    //    juste après, sans jamais perdre la trace de l'action elle-même.
    await supabaseAdmin.from('journal_console_dev').insert({
      action: 'suppression_ecole',
      ecole_id: ecoleId,
      ecole_nom: nomEcole,
      details: { nbComptesLies: (profilsEcole || []).length },
      auteur_id: user.id,
      auteur_nom: profil.nom_complet || '',
    });

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

    // 4) Supprimer les demandeurs sans aucun profil ni autre demande restante
    //    (jamais un compte rattaché à une autre école).
    let demandeursSupprimes = 0;
    for (const uid of idsDemandeurs) {
      if ((profilsEcole || []).some((p: { id: string }) => p.id === uid)) continue;
      const { data: autreProfil } = await supabaseAdmin.from('profiles').select('id').eq('id', uid).maybeSingle();
      if (autreProfil) continue;
      const { data: autresDemandes } = await supabaseAdmin.from('demandes_acces').select('id').eq('user_id', uid).limit(1);
      if (autresDemandes && autresDemandes.length) continue;
      const { error: errUser } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (!errUser) demandeursSupprimes++;
    }

    return new Response(
      JSON.stringify({ ok: true, comptesSupprimes: (profilsEcole || []).length - echecs.length, demandeursSupprimes, echecs }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
