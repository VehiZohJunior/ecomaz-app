// =====================================================================
// EcoMaZ — Fonction Edge : validation d'un pointage GPS (PUBLIQUE)
// =====================================================================
// Aucune authentification : l'enseignant qui clique le lien n'est PAS
// connecté à l'application. La sécurité vient uniquement du token
// (aléatoire, usage unique, expirant) — voir generer-lien-pointage et
// schema.sql section 39. Déployée avec --no-verify-jwt, comme
// webhook-paiement-en-ligne.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function heureActuelle(): string { return new Date().toISOString().slice(11, 16); }
function dateActuelle(): string { return new Date().toISOString().slice(0, 10); }
function minutesDepuisMinuit(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { token, latitude, longitude, precision } = await req.json();
    if (!token || typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new Error('Paramètres manquants');
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: lien, error: errLien } = await supabaseAdmin
      .from('liens_pointage_gps').select('*').eq('token', token).single();
    if (errLien || !lien) throw new Error("Lien invalide. Demandez un nouveau lien au secrétariat.");
    if (lien.utilise_at) throw new Error('Ce lien a déjà été utilisé.');
    if (new Date(lien.expire_at) < new Date()) throw new Error('Ce lien a expiré. Demandez un nouveau lien au secrétariat.');

    // Marqué utilisé immédiatement, avant le reste du traitement, pour
    // éviter une double validation en cas de double-clic/double-envoi.
    await supabaseAdmin.from('liens_pointage_gps').update({ utilise_at: new Date().toISOString() }).eq('id', lien.id);

    const { data: ecole } = await supabaseAdmin
      .from('ecoles').select('nom_ecole, geofence_latitude, geofence_longitude, geofence_rayon_metres, heure_arrivee_attendue')
      .eq('id', lien.ecole_id).single();
    if (!ecole?.geofence_latitude || !ecole?.geofence_longitude) {
      throw new Error("La zone de l'établissement n'est pas configurée. Contactez la direction.");
    }

    const distance = distanceMetres(latitude, longitude, ecole.geofence_latitude, ecole.geofence_longitude);
    const rayon = ecole.geofence_rayon_metres ?? 100;
    const precisionNum = typeof precision === 'number' ? precision : null;

    let statut: 'dans_etablissement' | 'hors_etablissement' | 'a_verifier';
    if (precisionNum !== null && precisionNum > 100) statut = 'a_verifier';
    else if (distance <= rayon) statut = 'dans_etablissement';
    else statut = 'hors_etablissement';

    // Position "trop parfaite" pour un vrai GPS de téléphone = suspecte.
    if (precisionNum !== null && precisionNum < 1) {
      await supabaseAdmin.from('alertes_pointage').insert({
        ecole_id: lien.ecole_id, enseignant_id: lien.enseignant_id,
        raison: `Pointage GPS avec une précision anormalement parfaite (${precisionNum} m) — à vérifier.`,
        score: precisionNum,
      });
      statut = 'a_verifier';
    }

    let adresseApprox: string | null = null;
    // Géocodage inverse (Nominatim) volontairement ABANDONNÉ : leur politique
    // d'usage bloque (403) les requêtes venant d'infrastructures cloud
    // partagées comme Supabase Edge Functions — confirmé en test, ce n'est
    // pas transitoire. Le lien Google Maps ci-dessous (coordonnées exactes)
    // couvre le même besoin, en plus précis, sans dépendance externe
    // supplémentaire à payer/configurer.

    const date = dateActuelle();
    const heure = heureActuelle();

    await supabaseAdmin.from('pointages_gps').insert({
      ecole_id: lien.ecole_id, enseignant_id: lien.enseignant_id, lien_id: lien.id,
      action: lien.action, date, heure,
      latitude, longitude, precision_metres: precisionNum, distance_metres: Math.round(distance),
      adresse_approx: adresseApprox, statut,
    });

    // Met aussi à jour presences_enseignants, comme le pointage QR, pour
    // que le reste de l'application (journal, ponctualité) reste cohérent.
    const { data: existant } = await supabaseAdmin
      .from('presences_enseignants').select('*')
      .eq('enseignant_id', lien.enseignant_id).eq('date', date).eq('ecole_id', lien.ecole_id)
      .maybeSingle();

    if (lien.action === 'arrivee' && !existant?.heure_arrivee) {
      const heureAttendue = (ecole.heure_arrivee_attendue || '07:30:00').slice(0, 5);
      const minutesRetard = Math.max(0, minutesDepuisMinuit(heure) - minutesDepuisMinuit(heureAttendue));
      const patch = { heure_arrivee: heure, statut: minutesRetard > 0 ? 'Retard' : 'Présent', methode: 'GPS', minutes_retard: minutesRetard };
      if (existant) await supabaseAdmin.from('presences_enseignants').update(patch).eq('id', existant.id);
      else await supabaseAdmin.from('presences_enseignants').insert({ date, enseignant_id: lien.enseignant_id, ecole_id: lien.ecole_id, motif: '', ...patch });
    } else if (lien.action === 'depart' && existant?.heure_arrivee && !existant.heure_depart) {
      await supabaseAdmin.from('presences_enseignants').update({ heure_depart: heure }).eq('id', existant.id);
    }

    return new Response(JSON.stringify({
      ok: true, statut, distanceMetres: Math.round(distance), adresseApprox, nomEcole: ecole.nom_ecole,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
