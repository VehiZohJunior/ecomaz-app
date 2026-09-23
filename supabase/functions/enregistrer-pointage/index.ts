import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Côte d'Ivoire (Africa/Abidjan) est en UTC+0 toute l'année, sans heure
// d'été — l'horloge serveur (UTC) correspond donc directement à l'heure
// locale, pas de conversion de fuseau horaire nécessaire.
function heureActuelle(): string {
  return new Date().toISOString().slice(11, 16); // "HH:MM"
}
function dateActuelle(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}
function minutesDepuisMinuit(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) Vérifier l'appelant avec SES droits (clé anon + son propre jeton) —
    // jamais la clé service_role pour cette étape.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseCaller.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profil } = await supabaseCaller.from('profiles').select('role, ecole_id').eq('id', user.id).single();
    if (!profil || !['secretariat', 'direction', 'fondation'].includes(profil.role)) {
      throw new Error("Seul le personnel administratif peut enregistrer un pointage");
    }

    const { enseignantId, action } = await req.json();
    if (!enseignantId || !['arrivee', 'depart'].includes(action)) {
      throw new Error('Paramètres invalides');
    }

    // 2) À partir d'ici, clé service_role — mais toute la logique de
    // confiance (heure, retard) reste calculée ICI, côté serveur, jamais
    // à partir de valeurs envoyées par le client.
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: enseignant, error: errEns } = await supabaseAdmin
      .from('enseignants').select('id, ecole_id').eq('id', enseignantId).eq('ecole_id', profil.ecole_id).single();
    if (errEns || !enseignant) throw new Error("Enseignant introuvable dans votre école");

    const { data: ecole, error: errEcole } = await supabaseAdmin
      .from('ecoles').select('heure_arrivee_attendue').eq('id', profil.ecole_id).single();
    if (errEcole) throw errEcole;

    const date = dateActuelle();
    const heure = heureActuelle();
    const heureAttendue = (ecole?.heure_arrivee_attendue || '07:30:00').slice(0, 5);

    const { data: existant } = await supabaseAdmin
      .from('presences_enseignants').select('*')
      .eq('enseignant_id', enseignantId).eq('date', date).eq('ecole_id', profil.ecole_id)
      .maybeSingle();

    if (action === 'arrivee') {
      if (existant?.heure_arrivee) {
        return reponse({ ok: true, deja: true, message: 'Arrivée déjà enregistrée aujourd\'hui.' });
      }
      const minutesRetard = Math.max(0, minutesDepuisMinuit(heure) - minutesDepuisMinuit(heureAttendue));
      const statut = minutesRetard > 0 ? 'Retard' : 'Présent';
      const patch = { heure_arrivee: heure, statut, methode: 'QR', minutes_retard: minutesRetard };

      let row;
      if (existant) {
        const { data, error } = await supabaseAdmin.from('presences_enseignants').update(patch).eq('id', existant.id).select().single();
        if (error) throw error;
        row = data;
      } else {
        const { data, error } = await supabaseAdmin.from('presences_enseignants')
          .insert({ date, enseignant_id: enseignantId, ecole_id: profil.ecole_id, motif: '', ...patch }).select().single();
        if (error) throw error;
        row = data;
      }
      return reponse({ ok: true, statut, minutesRetard, heure, date });
    } else {
      if (!existant?.heure_arrivee) throw new Error("Aucune arrivée enregistrée aujourd'hui pour cet enseignant");
      if (existant.heure_depart) {
        return reponse({ ok: true, deja: true, message: 'Départ déjà enregistré aujourd\'hui.' });
      }
      const { error } = await supabaseAdmin.from('presences_enseignants').update({ heure_depart: heure }).eq('id', existant.id);
      if (error) throw error;
      return reponse({ ok: true, statut: 'Départ', heure, date });
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});

function reponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
