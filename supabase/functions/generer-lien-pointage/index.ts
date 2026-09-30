// =====================================================================
// EcoMaZ — Fonction Edge : génère et envoie par SMS un lien de pointage
// GPS personnel (usage unique, expirant) pour un enseignant.
// =====================================================================
// Sécurité : réservé au personnel administratif (secretariat/direction/
// fondation). Le token lui-même n'est JAMAIS renvoyé au client — il ne
// transite que dans le SMS envoyé au téléphone de l'enseignant.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normaliserTelephoneCI(tel: string): string {
  let digits = (tel || '').replace(/\D/g, '');
  if (digits.startsWith('225')) digits = digits.slice(3);
  return '+225' + digits;
}

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

    const { data: profil } = await supabaseCaller.from('profiles').select('role, ecole_id').eq('id', user.id).single();
    if (!profil || !['secretariat', 'direction', 'fondation'].includes(profil.role)) {
      throw new Error('Réservé au personnel administratif');
    }

    const { enseignantId, action, origine } = await req.json();
    if (!enseignantId || !['arrivee', 'depart'].includes(action) || !origine) {
      throw new Error('Paramètres manquants');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: enseignant, error: errEns } = await supabaseAdmin
      .from('enseignants').select('id, ecole_id, nom, prenom, telephone')
      .eq('id', enseignantId).eq('ecole_id', profil.ecole_id).single();
    if (errEns || !enseignant) throw new Error('Enseignant introuvable dans votre école');
    if (!enseignant.telephone) throw new Error("Cet enseignant n'a pas de numéro de téléphone enregistré");

    const { data: ecole } = await supabaseAdmin.from('ecoles').select('nom_ecole, geofence_latitude, geofence_longitude').eq('id', profil.ecole_id).single();
    if (!ecole?.geofence_latitude || !ecole?.geofence_longitude) {
      throw new Error("La zone de l'établissement n'est pas encore configurée (Paramètres → Zone de l'établissement)");
    }

    const expireAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: lien, error: errLien } = await supabaseAdmin.from('liens_pointage_gps').insert({
      ecole_id: profil.ecole_id, enseignant_id: enseignantId, action, expire_at: expireAt,
    }).select('token').single();
    if (errLien) throw errLien;

    const url = `${origine.replace(/\/$/, '')}/pointage-gps.html?token=${lien.token}`;
    const libelleAction = action === 'arrivee' ? 'votre arrivée' : 'votre départ';
    const message = `${ecole?.nom_ecole || 'École'} : cliquez ce lien pour valider ${libelleAction} (valable 30 min) : ${url}`;

    let smsEnvoye = false;
    try {
      const AT_USERNAME = Deno.env.get('AT_USERNAME')!;
      const AT_API_KEY = Deno.env.get('AT_API_KEY')!;
      const sandbox = (Deno.env.get('AT_SANDBOX') ?? 'true') === 'true';
      const baseUrl = sandbox
        ? 'https://api.sandbox.africastalking.com/version1/messaging'
        : 'https://api.africastalking.com/version1/messaging';
      const resp = await fetch(baseUrl, {
        method: 'POST',
        headers: { apiKey: AT_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ username: AT_USERNAME, to: normaliserTelephoneCI(enseignant.telephone), message }),
      });
      smsEnvoye = resp.ok;
    } catch (_e) {
      smsEnvoye = false;
    }

    return new Response(JSON.stringify({ ok: true, smsEnvoye }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
