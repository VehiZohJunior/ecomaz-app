// =====================================================================
// EcoMaZ — Fonction Edge : activer l'accès d'un enseignant depuis sa fiche
// =====================================================================
// La direction (ou le secrétariat) a créé la fiche de l'enseignant ;
// elle indique son adresse Gmail et « active son accès » :
//   - si aucun compte n'existe pour cette adresse, il est créé (adresse
//     confirmée, sans mot de passe connu de quiconque) ;
//   - si l'enseignant s'est déjà connecté avec Google (compte sans profil,
//     demande d'accès en attente), ce compte est repris et la demande close.
// Le profil « enseignant » est relié à la fiche : l'enseignant touche
// ensuite « Continuer avec Google » avec la même adresse et entre
// directement, en ne voyant que les classes de sa fiche.
//
// Sécurité : appelant vérifié par son jeton (secrétariat, direction,
// fondation de la MÊME école) avant toute opération service_role ; la
// fiche doit appartenir à l'école et ne pas être déjà reliée ; une adresse
// déjà utilisée par un autre profil est refusée.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    if (!profil || !['secretariat', 'direction', 'fondation'].includes(profil.role)) throw new Error('Réservé au personnel administratif');

    const { enseignantId, email } = await req.json();
    const adresse = String(email || '').trim().toLowerCase();
    if (!enseignantId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse) || adresse.length > 120) throw new Error('Indiquez une adresse e-mail valide');

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: fiche } = await admin.from('enseignants').select('id, ecole_id, nom, prenom, sexe, statut')
      .eq('id', enseignantId).eq('ecole_id', profil.ecole_id).maybeSingle();
    if (!fiche) throw new Error('Fiche enseignant introuvable dans votre école');
    const { data: dejaRelie } = await admin.from('profiles').select('id').eq('enseignant_id', fiche.id).maybeSingle();
    if (dejaRelie) throw new Error('Cet enseignant a déjà son accès');

    // Compte existant pour cette adresse ? (l'enseignant s'est peut-être déjà connecté avec Google)
    let compteId: string | null = null;
    for (let page = 1; page <= 20 && !compteId; page++) {
      const { data: liste, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const trouve = (liste?.users || []).find((u) => (u.email || '').toLowerCase() === adresse);
      if (trouve) compteId = trouve.id;
      if (!liste || (liste.users || []).length < 1000) break;
    }
    let nouveau = false;
    if (compteId) {
      const { data: profilExistant } = await admin.from('profiles').select('id').eq('id', compteId).maybeSingle();
      if (profilExistant) throw new Error('Cette adresse est déjà utilisée par un autre compte EcoMaZ');
    } else {
      const { data: cree, error } = await admin.auth.admin.createUser({ email: adresse, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID() });
      if (error) throw error;
      compteId = cree.user.id; nouveau = true;
    }

    const nom = `${fiche.prenom || ''} ${fiche.nom || ''}`.trim();
    const civ = fiche.sexe === 'M' || fiche.sexe === 'F' ? fiche.sexe : null;
    const { error: errProfil } = await admin.from('profiles').insert({
      id: compteId, ecole_id: profil.ecole_id, role: 'enseignant', nom_complet: nom, enseignant_id: fiche.id,
      civilite: civ, nom_appel: civ ? nom : null,
    });
    if (errProfil) {
      if (nouveau) await admin.auth.admin.deleteUser(compteId);
      throw errProfil;
    }
    if (fiche.statut !== 'Actif') await admin.from('enseignants').update({ statut: 'Actif' }).eq('id', fiche.id);
    // Une éventuelle demande d'accès en attente de ce compte est close
    await admin.from('demandes_acces').update({ statut: 'approuvee', traite_par: user.id })
      .eq('user_id', compteId).eq('ecole_id', profil.ecole_id).eq('statut', 'en_attente');

    return json({ ok: true, profilId: compteId, nouveau });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});
