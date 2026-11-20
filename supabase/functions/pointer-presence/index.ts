// =====================================================================
// EcoMaZ — Fonction Edge : pointage depuis l'application (2026-11-20)
// =====================================================================
// L'enseignant connecté pointe son arrivée / son départ par :
//   - « gps »   : la position du téléphone seule ;
//   - « qr »    : le scan de l'affiche QR de l'école (jeton secret) + GPS ;
//   - « photo » : une photo prise en direct par la caméra avant + GPS.
// « appel » : vérification de position avant l'appel des élèves (enseignant,
// secrétariat) — n'enregistre aucune présence, ouvre seulement un droit de
// 2 heures (positions_valides, schema.sql section 126).
//
// LE GPS EST DÉTERMINANT : hors de la zone de l'établissement, position
// trop imprécise, position « trop parfaite » (fausse position), localisation
// refusée, QR non reconnu… → REFUS. Chaque refus est enregistré
// (alertes_pointage + pointages_gps) et signalé aussitôt à la direction.
// Tout est décidé ici, côté serveur : la page ne fait que transmettre.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';
import { ORIGINE_APPLI, ENTETES_SECURITE, messagePublic, limiter, tropVolumineux } from '../_shared/securite.ts';
import { envoyerPush } from '../_shared/push.ts';

const CORS_HEADERS = {
  ...ENTETES_SECURITE,
  'Access-Control-Allow-Origin': ORIGINE_APPLI,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const METHODES = ['gps', 'qr', 'photo', 'appel'];
const LIB_METHODE: Record<string, string> = { gps: 'GPS', qr: 'QR de l’école', photo: 'photo', appel: 'appel des élèves' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  { const refus = tropVolumineux(req, 900_000); if (refus) return refus; }
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');
    const appelant = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await appelant.auth.getUser();
    if (!user) throw new Error('Non authentifié');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const corps = await req.json().catch(() => ({}));
    const methode = String(corps.methode || '');
    if (!METHODES.includes(methode)) throw new Error('Méthode de pointage inconnue');
    const lat = typeof corps.latitude === 'number' && Number.isFinite(corps.latitude) && Math.abs(corps.latitude) <= 90 ? corps.latitude : null;
    const lng = typeof corps.longitude === 'number' && Number.isFinite(corps.longitude) && Math.abs(corps.longitude) <= 180 ? corps.longitude : null;
    const precision = typeof corps.precision === 'number' && Number.isFinite(corps.precision) ? Math.round(corps.precision * 10) / 10 : null;
    const classeId = typeof corps.classeId === 'string' ? corps.classeId.slice(0, 80) : null;
    const erreurGps = typeof corps.erreurGps === 'string' ? corps.erreurGps.slice(0, 120) : '';

    const { data: profil } = await admin.from('profiles').select('ecole_id, role, enseignant_id, nom_complet').eq('id', user.id).maybeSingle();
    if (!profil?.ecole_id) throw new Error('Compte non relié à une école');
    if (methode === 'appel') {
      if (!['enseignant', 'secretariat', 'direction', 'fondation'].includes(profil.role)) throw new Error('Réservé au personnel de l’école');
    } else if (profil.role !== 'enseignant' || !profil.enseignant_id) {
      throw new Error('Le pointage est réservé aux enseignants (fonction « Enseignant »)');
    }
    await limiter(admin, user.id, 'pointer-presence', 20, 10);

    const { data: ecole } = await admin.from('ecoles')
      .select('geofence_latitude, geofence_longitude, geofence_rayon_metres, heure_arrivee_attendue').eq('id', profil.ecole_id).single();
    const zone = ecole?.geofence_latitude != null && ecole?.geofence_longitude != null;
    if (!zone) {
      if (methode === 'appel') return json({ ok: true, sansZone: true });
      throw new Error('La zone de l’établissement n’est pas encore configurée (Paramètres → Zone de l’établissement). Prévenez la direction.');
    }

    let nom = profil.nom_complet || 'Un membre du personnel';
    if (profil.enseignant_id) {
      const { data: f } = await admin.from('enseignants').select('nom, prenom').eq('id', profil.enseignant_id).maybeSingle();
      if (f) nom = `${f.prenom} ${f.nom}`;
    }

    // ---- Décision : le GPS d'abord
    const rayon = ecole!.geofence_rayon_metres ?? 100;
    const distance = lat != null && lng != null ? Math.round(distanceMetres(lat, lng, ecole!.geofence_latitude, ecole!.geofence_longitude)) : null;
    let refus = '';
    if (lat == null || lng == null) refus = `Localisation indisponible ou refusée sur le téléphone${erreurGps ? ` (${erreurGps})` : ''}`;
    else if (precision != null && precision < 1) refus = `Position anormalement parfaite (${precision} m) : possible fausse position GPS`;
    else if (precision == null || precision > 100) refus = `Position trop imprécise (± ${precision ?? '?'} m)`;
    else if (distance! > rayon) refus = `Hors de l’établissement : à ${distance} m de l’école (zone de ${rayon} m)`;

    if (!refus && methode === 'qr') {
      const { data: j } = await admin.from('pointage_jetons').select('jeton').eq('ecole_id', profil.ecole_id).maybeSingle();
      const lu = typeof corps.jeton === 'string' ? corps.jeton.trim() : '';
      if (!j?.jeton || lu !== j.jeton) refus = 'QR code non reconnu : ce n’est pas l’affiche de pointage de l’école';
    }

    // ---- Photo (gardée aussi en cas de refus : c'est une preuve)
    let photoChemin: string | null = null;
    const date = new Date().toISOString().slice(0, 10), heure = new Date().toISOString().slice(11, 16);
    if (methode === 'photo') {
      const m = typeof corps.photo === 'string' ? corps.photo.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/) : null;
      if (!m) { if (!refus) refus = 'Photo manquante : la photo doit être prise en direct avec la caméra'; }
      else {
        const octets = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
        if (octets.length > 600_000 || octets[0] !== 0xff || octets[1] !== 0xd8) { if (!refus) refus = 'Photo non valide'; }
        else {
          const chemin = `${profil.ecole_id}/${date}/${profil.enseignant_id}-${Date.now()}.jpg`;
          const { error } = await admin.storage.from('pointages').upload(chemin, octets, { contentType: 'image/jpeg', upsert: false });
          if (!error) photoChemin = chemin;
        }
      }
    }

    const action = corps.action === 'depart' ? 'depart' : 'arrivee';
    if (refus) {
      const type = methode === 'appel' ? 'appel' : 'enseignant';
      await admin.from('alertes_pointage').insert({
        ecole_id: profil.ecole_id, enseignant_id: profil.enseignant_id, date, heure,
        raison: refus, type, methode, latitude: lat, longitude: lng, distance_metres: distance,
        precision_metres: precision, photo_chemin: photoChemin, classe_id: classeId, auteur_id: user.id, auteur_nom: nom,
      });
      if (type === 'enseignant' && lat != null && lng != null) {
        await admin.from('pointages_gps').insert({
          ecole_id: profil.ecole_id, enseignant_id: profil.enseignant_id, action, date, heure, latitude: lat, longitude: lng,
          precision_metres: precision, distance_metres: distance, statut: distance != null && distance > rayon ? 'hors_etablissement' : 'a_verifier',
          methode, photo_chemin: photoChemin, motif_refus: refus,
        });
      }
      const { data: dir } = await admin.from('profiles').select('id').eq('ecole_id', profil.ecole_id).in('role', ['direction', 'fondation']);
      await envoyerPush(admin, (dir || []).map((d: { id: string }) => d.id), {
        title: type === 'appel' ? '⚠️ Appel des élèves refusé' : '⚠️ Pointage enseignant refusé',
        body: `${nom} — ${refus} (${heure}, ${LIB_METHODE[methode]}). Détail : Tableau de bord → Alertes pointage.`,
        url: './index.html', tag: `alerte-pointage-${Date.now()}`,
      }).catch(() => ({ envoyes: 0, echecs: 0 }));
      return json({ ok: false, refuse: true, raison: refus, distanceMetres: distance, rayon });
    }

    // ---- Accepté : position vérifiée dans l'établissement
    await admin.from('positions_valides').insert({ user_id: user.id, ecole_id: profil.ecole_id, distance_metres: distance });
    if (methode === 'appel') return json({ ok: true, distanceMetres: distance });

    const { data: existant } = await admin.from('presences_enseignants').select('*')
      .eq('enseignant_id', profil.enseignant_id).eq('date', date).eq('ecole_id', profil.ecole_id).maybeSingle();
    let resultat: Record<string, unknown> = {};
    if (action === 'arrivee') {
      if (existant?.heure_arrivee) return json({ ok: true, deja: true, action, heure: String(existant.heure_arrivee).slice(0, 5), statut: existant.statut });
      const attendue = String(ecole!.heure_arrivee_attendue || '07:30:00').slice(0, 5);
      const retard = Math.max(0, minutes(heure) - minutes(attendue));
      const patch = { heure_arrivee: heure, statut: retard > 0 ? 'Retard' : 'Présent', methode: methode === 'qr' ? 'QR' : methode === 'photo' ? 'Photo' : 'GPS', minutes_retard: retard };
      if (existant) await admin.from('presences_enseignants').update(patch).eq('id', existant.id);
      else await admin.from('presences_enseignants').insert({ date, enseignant_id: profil.enseignant_id, ecole_id: profil.ecole_id, motif: '', ...patch });
      resultat = { heure, statut: patch.statut, minutesRetard: retard };
    } else {
      if (!existant?.heure_arrivee) throw new Error('Pointez d’abord votre arrivée.');
      if (existant.heure_depart) return json({ ok: true, deja: true, action, heure: String(existant.heure_depart).slice(0, 5) });
      await admin.from('presences_enseignants').update({ heure_depart: heure }).eq('id', existant.id);
      resultat = { heure };
    }
    await admin.from('pointages_gps').insert({
      ecole_id: profil.ecole_id, enseignant_id: profil.enseignant_id, action, date, heure, latitude: lat, longitude: lng,
      precision_metres: precision, distance_metres: distance, statut: 'dans_etablissement', methode, photo_chemin: photoChemin,
    });
    return json({ ok: true, action, distanceMetres: distance, ...resultat });
  } catch (e) {
    return json({ ok: false, error: messagePublic(e) }, 400);
  }
});
