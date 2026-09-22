// =====================================================================
// EcoMaZ — Fonction Edge : création d'une école cliente (Console Développeur)
// =====================================================================
// À déployer via Supabase Dashboard → Edge Functions → "Deploy a new
// function" (copier-coller ce code, nommer la fonction "creer-ecole-cliente").
//
// Aucun secret à configurer manuellement : SUPABASE_URL, SUPABASE_ANON_KEY
// et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase à
// chaque fonction Edge.
//
// Sécurité : seul un compte dont le profil a le rôle "developpeur" peut
// utiliser cette fonction (vérifié ci-dessous avec le jeton de l'appelant,
// AVANT toute opération avec la clé service_role). C'est la SEULE voie qui
// crée une école — il n'existe aucune policy RLS d'insertion sur "ecoles"
// ou "profiles" pour les autres rôles, donc aucun autre compte ne peut en
// créer une, même en contournant l'interface.
// =====================================================================

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

    // 1) Vérifie l'identité de l'appelant avec SON PROPRE jeton — aucun
    // privilège élevé à ce stade.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseCaller.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profil } = await supabaseCaller
      .from('profiles').select('role').eq('id', user.id).single();
    if (!profil || profil.role !== 'developpeur') {
      throw new Error("Réservé au rôle développeur");
    }

    const { nomEcole, adresse, telephone, directeurNom, directeurEmail, directeurMotDePasse } =
      await req.json();
    if (!nomEcole || !directeurNom || !directeurEmail || !directeurMotDePasse) {
      throw new Error('Paramètres manquants (nom école, nom/email/mot de passe du directeur)');
    }
    if (directeurMotDePasse.length < 6) {
      throw new Error('Le mot de passe doit contenir au moins 6 caractères');
    }

    // 2) À partir d'ici seulement : clé service_role, jamais transmise au
    // navigateur, utilisée uniquement dans ce code serveur.
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: ecole, error: errEcole } = await supabaseAdmin
      .from('ecoles')
      .insert({ nom_ecole: nomEcole, adresse: adresse || '', telephone: telephone || '' })
      .select()
      .single();
    if (errEcole) throw errEcole;

    const { data: authUser, error: errAuth } = await supabaseAdmin.auth.admin.createUser({
      email: directeurEmail,
      password: directeurMotDePasse,
      email_confirm: true,
    });
    if (errAuth) {
      // Annule la création de l'école si le compte n'a pas pu être créé,
      // pour ne jamais laisser une école "orpheline" sans accès.
      await supabaseAdmin.from('ecoles').delete().eq('id', ecole.id);
      throw errAuth;
    }

    const { error: errProfil } = await supabaseAdmin.from('profiles').insert({
      id: authUser.user.id,
      ecole_id: ecole.id,
      role: 'direction',
      nom_complet: directeurNom,
    });
    if (errProfil) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      await supabaseAdmin.from('ecoles').delete().eq('id', ecole.id);
      throw errProfil;
    }

    return new Response(JSON.stringify({ ok: true, ecoleId: ecole.id }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
