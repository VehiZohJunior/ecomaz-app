// =====================================================================
// EcoMaZ — Fonction Edge : annonces horaires automatiques « intelligentes »
// =====================================================================
// Appelée CHAQUE MINUTE par un job pg_cron (voir schema.sql sections 35 et
// 50 — le job lui-même, avec son secret, est appliqué séparément, jamais
// commité sur GitHub). Abidjan = UTC+0, aucune conversion nécessaire.
//
// Les horaires enregistrés sont les HEURES RÉELLES (début des cours, pause
// de 10h, pause de midi, après-midi, fin, fin du renforcement). Chaque
// annonce part « avance_minutes » AVANT (15 min par défaut) :
// - uniquement les jours de classe (jours_cours, lundi = 1 … dimanche = 7)
//   et pas pendant une suspension (vacances : suspendu_jusquau) ;
// - rattrapage : si une minute a été manquée, l'annonce part à l'appel
//   suivant tant que le moment annoncé n'est pas atteint ;
// - jamais deux fois (contrainte unique école / annonce / cycle / jour) ;
// - renforcement : les parents des élèves cochés « renforcement » reçoivent
//   un message à part (enfant retenu de 16h à 17h, puis fin du renforcement),
//   et ne reçoivent pas l'invitation à venir chercher l'enfant à 16h.
//
// Sécurité : accès public (verify_jwt=false, comme un webhook), protégé
// par le secret partagé « x-cron-secret » (variable CRON_SECRET).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envoyerPush, parentsDesEleves } from '../_shared/push.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

type Cycle = 'primaire' | 'maternelle';
const CYCLES_CLASSES: Record<Cycle, string[]> = { primaire: ['Primaire'], maternelle: ['Garderie', 'Maternelle'] };
const LIBELLE: Record<Cycle, string> = { primaire: 'le Primaire', maternelle: 'la Maternelle' };

const enMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const lisible = (hhmm: string) => hhmm.slice(0, 5).replace(':', 'h');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const secretAttendu = Deno.env.get('CRON_SECRET');
    if (!secretAttendu || req.headers.get('x-cron-secret') !== secretAttendu) {
      return new Response(JSON.stringify({ ok: false, error: 'Non autorisé' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const maintenant = new Date();
    const dateDuJour = maintenant.toISOString().slice(0, 10);
    const minuteActuelle = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
    const jourIso = ((maintenant.getUTCDay() + 6) % 7) + 1; // lundi = 1 … dimanche = 7

    const { data: horaires, error: errHoraires } = await supabaseAdmin
      .from('horaires_annonces')
      .select('*, ecoles!inner(id, actif, nom_ecole)')
      .eq('actif', true)
      .eq('ecoles.actif', true);
    if (errHoraires) throw errHoraires;

    let nbEnvoyees = 0;
    const erreurs: string[] = [];

    for (const h of (horaires || []) as Record<string, any>[]) {
      if (!(h.jours_cours || [1, 2, 3, 4, 5]).includes(jourIso)) continue;          // pas de classe aujourd'hui
      if (h.suspendu_jusquau && h.suspendu_jusquau >= dateDuJour) continue;         // vacances
      const avance = Number.isFinite(h.avance_minutes) ? h.avance_minutes : 15;
      const dans = avance > 0 ? `dans ${avance} minutes` : 'maintenant';

      // Élèves actifs par cycle (pour les notifications push) et inscrits au renforcement
      const { data: elevesActifs } = await supabaseAdmin
        .from('eleves').select('id, renforcement, classes!inner(cycle)')
        .eq('ecole_id', h.ecole_id).eq('statut', 'Actif');
      const parCycle: Record<Cycle, string[]> = { primaire: [], maternelle: [] };
      const renforcement: Record<Cycle, string[]> = { primaire: [], maternelle: [] };
      for (const e of (elevesActifs || []) as any[]) {
        for (const c of ['primaire', 'maternelle'] as Cycle[]) {
          if (!CYCLES_CLASSES[c].includes(e.classes?.cycle)) continue;
          parCycle[c].push(e.id);
          if (e.renforcement) renforcement[c].push(e.id);
        }
      }
      const nomEcole = (h.ecoles as any)?.nom_ecole || 'EcoMaZ';

      for (const cycle of ['primaire', 'maternelle'] as Cycle[]) {
        const heure = (champ: string) => String(h[`${champ}_${cycle}`] || '').slice(0, 5);
        const fin = heure('apresmidi_fin');
        const finRenf = String(h.renforcement_fin || '').slice(0, 5);
        // Jours sans renforcement : personne n'est retenu, tout le monde reçoit la fin des cours
        const renfAujourdhui = (h.jours_renforcement || [1, 2, 3, 4, 5]).includes(jourIso);
        const retenus = renfAujourdhui ? renforcement[cycle] : [];

        const annonces: { fonction: string; moment: string; contenu: string; eleve_ids?: string[]; eleve_ids_exclus?: string[] }[] = [
          { fonction: 'matin_debut', moment: heure('matin_debut'),
            contenu: `🔔 Les cours du matin commencent ${dans} (à ${lisible(heure('matin_debut'))}) pour ${LIBELLE[cycle]}.` },
          { fonction: 'pause_matin', moment: heure('pause_matin'),
            contenu: `☕ La pause de ${lisible(heure('pause_matin'))} commence ${dans} pour ${LIBELLE[cycle]}.` },
          { fonction: 'midi_pause', moment: heure('midi_pause'),
            contenu: `🍽️ La pause de midi commence ${dans} (à ${lisible(heure('midi_pause'))}) pour ${LIBELLE[cycle]}.` },
          { fonction: 'apresmidi_debut', moment: heure('apresmidi_debut'),
            contenu: `📚 Les cours de l'après-midi commencent ${dans} (à ${lisible(heure('apresmidi_debut'))}) pour ${LIBELLE[cycle]}.` },
          { fonction: 'apresmidi_fin', moment: fin,
            contenu: `🏁 Les cours se terminent ${dans} (à ${lisible(fin)}) pour ${LIBELLE[cycle]} : vous pouvez venir chercher votre enfant.`,
            eleve_ids_exclus: retenus.length ? retenus : undefined },
        ];
        if (retenus.length && finRenf) {
          annonces.push(
            { fonction: 'renforcement_debut', moment: fin, eleve_ids: retenus,
              contenu: `📘 Les cours habituels se terminent ${dans} (à ${lisible(fin)}), mais votre enfant est retenu pour le cours de renforcement, de ${lisible(fin)} à ${lisible(finRenf)}.` },
            { fonction: 'renforcement_fin', moment: finRenf, eleve_ids: retenus,
              contenu: `🏁 Le cours de renforcement se termine ${dans} (à ${lisible(finRenf)}) : vous pouvez venir chercher votre enfant.` },
          );
        }

        for (const a of annonces) {
          if (!/^\d{2}:\d{2}$/.test(a.moment)) continue;
          const momentMin = enMinutes(a.moment);
          // Fenêtre d'envoi : de (moment - avance) jusqu'au moment lui-même (rattrapage)
          if (minuteActuelle < momentMin - avance || minuteActuelle > momentMin) continue;
          const { error: errInsert } = await supabaseAdmin.from('annonces_horaires_envoyees').insert({
            ecole_id: h.ecole_id, fonction: a.fonction, cycle, date: dateDuJour, contenu: a.contenu,
            eleve_ids: a.eleve_ids ?? null, eleve_ids_exclus: a.eleve_ids_exclus ?? null,
          });
          if (errInsert) {
            if (!String(errInsert.message || '').toLowerCase().includes('duplicate')) {
              erreurs.push(`${h.ecole_id}/${a.fonction}/${cycle}: ${errInsert.message}`);
            }
            continue;
          }
          nbEnvoyees++;
          // Notification push sur le téléphone des parents concernés (même application fermée)
          try {
            const exclus = new Set(a.eleve_ids_exclus || []);
            const cibles = (a.eleve_ids || parCycle[cycle]).filter((id) => !exclus.has(id));
            const parents = await parentsDesEleves(supabaseAdmin, h.ecole_id, cibles);
            await envoyerPush(supabaseAdmin, parents, { title: nomEcole, body: a.contenu, url: './parent.html', tag: `${a.fonction}-${cycle}` });
          } catch (e) { erreurs.push(`push ${a.fonction}/${cycle}: ${(e as Error).message}`); }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, nbEnvoyees, erreurs }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
