// =====================================================================
// EcoMaZ — Fonction Edge : annonces horaires automatiques
// =====================================================================
// Appelée CHAQUE MINUTE par un job pg_cron (voir schema.sql section 35 —
// le job lui-même, avec son secret, est appliqué séparément, jamais
// commité sur GitHub). Compare l'heure actuelle (Abidjan = UTC+0, aucune
// conversion nécessaire) aux horaires configurés de chaque école active,
// et insère UNE annonce par (école, fonction, cycle, jour) — la
// contrainte unique de la table empêche tout doublon.
//
// Sécurité : accès public (verify_jwt=false, comme un webhook), mais
// protégé par un secret partagé transmis dans l'en-tête "x-cron-secret",
// comparé à la variable d'environnement CRON_SECRET (configurée via
// `supabase secrets set`, jamais dans le code ni sur GitHub). Sans ce
// secret, la requête est refusée avant toute opération sur la base.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const FONCTIONS: { id: string; champPrimaire: string; champMaternelle: string; compose: (cycleLabel: string) => string }[] = [
  {
    id: 'matin_debut', champPrimaire: 'matin_debut_primaire', champMaternelle: 'matin_debut_maternelle',
    compose: (cycleLabel) => `🔔 Les cours du matin viennent de commencer pour le cycle ${cycleLabel}.`,
  },
  {
    id: 'midi_pause', champPrimaire: 'midi_pause_primaire', champMaternelle: 'midi_pause_maternelle',
    compose: (cycleLabel) => `🍽️ C'est la pause de midi pour le cycle ${cycleLabel}.`,
  },
  {
    id: 'apresmidi_debut', champPrimaire: 'apresmidi_debut_primaire', champMaternelle: 'apresmidi_debut_maternelle',
    compose: (cycleLabel) => `📚 Les cours de l'après-midi viennent de commencer pour le cycle ${cycleLabel}.`,
  },
  {
    id: 'apresmidi_fin', champPrimaire: 'apresmidi_fin_primaire', champMaternelle: 'apresmidi_fin_maternelle',
    compose: (cycleLabel) => `🏁 Les cours sont terminés pour aujourd'hui pour le cycle ${cycleLabel} — merci de venir chercher votre enfant.`,
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const secretAttendu = Deno.env.get('CRON_SECRET');
    const secretRecu = req.headers.get('x-cron-secret');
    if (!secretAttendu || secretRecu !== secretAttendu) {
      return new Response(JSON.stringify({ ok: false, error: 'Non autorisé' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const maintenant = new Date();
    const heureActuelle = maintenant.toISOString().slice(11, 16); // "HH:MM", Abidjan = UTC+0
    const dateActuelle = maintenant.toISOString().slice(0, 10);

    const { data: horaires, error: errHoraires } = await supabaseAdmin
      .from('horaires_annonces')
      .select('*, ecoles!inner(id, nom_ecole, actif)')
      .eq('actif', true)
      .eq('ecoles.actif', true);
    if (errHoraires) throw errHoraires;

    let nbEnvoyees = 0;
    const erreurs: string[] = [];

    for (const h of horaires || []) {
      for (const fn of FONCTIONS) {
        for (const cycle of ['primaire', 'maternelle'] as const) {
          const champ = cycle === 'primaire' ? fn.champPrimaire : fn.champMaternelle;
          const heureConfiguree = String((h as Record<string, unknown>)[champ] || '').slice(0, 5);
          if (heureConfiguree !== heureActuelle) continue;

          const cycleLabel = cycle === 'primaire' ? 'Primaire' : 'Maternelle';
          const { error: errInsert } = await supabaseAdmin.from('annonces_horaires_envoyees').insert({
            ecole_id: h.ecole_id,
            fonction: fn.id,
            cycle,
            date: dateActuelle,
            contenu: fn.compose(cycleLabel),
          });
          if (errInsert) {
            // Doublon (contrainte unique) = déjà envoyée cette minute-ci pour cette école : ignoré sans bruit.
            if (!String(errInsert.message || '').toLowerCase().includes('duplicate')) {
              erreurs.push(`${h.ecole_id}/${fn.id}/${cycle}: ${errInsert.message}`);
            }
            continue;
          }
          nbEnvoyees++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, nbEnvoyees, erreurs }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
