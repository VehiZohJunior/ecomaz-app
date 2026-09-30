// =====================================================================
// EcoMaZ — Fonction Edge : création d'un compte parent (depuis la fiche
// élève, personnel administratif uniquement)
// =====================================================================
// Gère 2 cas :
//  1) Nouveau parent : crée le compte auth + le profil (role='parent'),
//     puis le lien parents_eleves.
//  2) Parent déjà existant (ex : 2e enfant, ou père/mère déjà créé pour
//     un autre enfant) : retrouve le compte existant, vérifie qu'il
//     appartient bien à la même école et qu'il a le rôle "parent", puis
//     ajoute simplement le nouveau lien parents_eleves.
//
// Sécurité : seul un compte "secretariat"/"direction"/"fondation" de
// L'ÉCOLE DE L'ÉLÈVE peut appeler cette fonction (vérifié avec le jeton
// de l'appelant, avant toute opération avec la clé service_role).
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

    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseCaller.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profil } = await supabaseCaller
      .from('profiles').select('role, ecole_id, nom_complet').eq('id', user.id).single();
    if (!profil || !['secretariat', 'direction', 'fondation'].includes(profil.role)) {
      throw new Error('Réservé au personnel administratif');
    }

    const { eleveId, parentNom, parentEmail, parentMotDePasse } = await req.json();
    if (!eleveId || !parentNom || !parentEmail) {
      throw new Error('Paramètres manquants (élève, nom et email du parent)');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: eleve } = await supabaseAdmin
      .from('eleves').select('id, ecole_id, nom, prenom')
      .eq('id', eleveId).eq('ecole_id', profil.ecole_id).single();
    if (!eleve) throw new Error("Élève introuvable dans votre école");

    let parentUserId: string | null = null;
    let nouveauCompte = false;

    const { data: creation, error: errCreation } = await supabaseAdmin.auth.admin.createUser({
      email: parentEmail,
      password: parentMotDePasse || crypto.randomUUID(),
      email_confirm: true,
    });

    if (errCreation) {
      if (!String(errCreation.message || '').toLowerCase().includes('already')) throw errCreation;

      const { data: liste } = await supabaseAdmin.auth.admin.listUsers();
      const existant = liste?.users?.find(
        (u) => u.email?.toLowerCase() === String(parentEmail).toLowerCase()
      );
      if (!existant) throw new Error('Un compte existe déjà pour cet email, mais impossible de le retrouver.');

      const { data: profilExistant } = await supabaseAdmin
        .from('profiles').select('role, ecole_id').eq('id', existant.id).single();
      if (!profilExistant || profilExistant.role !== 'parent' || profilExistant.ecole_id !== profil.ecole_id) {
        throw new Error("Cet email est déjà utilisé par un compte non-parent ou d'une autre école.");
      }
      parentUserId = existant.id;
    } else {
      parentUserId = creation.user.id;
      nouveauCompte = true;
      const { error: errProfil } = await supabaseAdmin.from('profiles').insert({
        id: parentUserId,
        ecole_id: profil.ecole_id,
        role: 'parent',
        nom_complet: parentNom,
      });
      if (errProfil) {
        await supabaseAdmin.auth.admin.deleteUser(parentUserId);
        throw errProfil;
      }
    }

    const { error: errLien } = await supabaseAdmin.from('parents_eleves').insert({
      ecole_id: profil.ecole_id,
      parent_profile_id: parentUserId,
      eleve_id: eleveId,
    });
    if (errLien) {
      if (String(errLien.message || '').toLowerCase().includes('duplicate')) {
        throw new Error('Ce parent est déjà lié à cet élève.');
      }
      if (nouveauCompte) {
        await supabaseAdmin.from('profiles').delete().eq('id', parentUserId);
        await supabaseAdmin.auth.admin.deleteUser(parentUserId);
      }
      throw errLien;
    }

    return new Response(
      JSON.stringify({ ok: true, parentUserId, nouveauCompte }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
