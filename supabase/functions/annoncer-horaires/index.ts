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

const fcfa = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' F';
const jj = (iso: string) => iso.split('-').reverse().join('/');
const ecartJours = (a: string, b: string) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);

// Relance polie des tranches impayées : J-3, jour J, J+7. Envoyée par
// notification et dans la messagerie du parent, une seule fois par étape.
// deno-lint-ignore no-explicit-any
async function relancesScolarite(admin: any, aujourdhui: string, minuteActuelle: number): Promise<number> {
  const { data: ecoles } = await admin.from('ecoles').select('id, nom_ecole, heure_relances')
    .eq('actif', true).eq('relances_scolarite', true).eq('scolarite_visible_parents', true);
  let n = 0;
  for (const ec of (ecoles || []) as { id: string; nom_ecole: string; heure_relances: string }[]) {
    const h = String(ec.heure_relances || '10:00').slice(0, 5);
    if (minuteActuelle < enMinutes(h) || minuteActuelle > enMinutes(h) + 30) continue;
    const [{ data: ech }, { data: eleves }, { data: paiements }] = await Promise.all([
      admin.from('echeances_scolarite').select('id, label, montant, date_echeance, classe_id').eq('ecole_id', ec.id).not('date_echeance', 'is', null),
      admin.from('eleves').select('id, nom, prenom, classe_id').eq('ecole_id', ec.id).eq('statut', 'Actif'),
      admin.from('paiements_scolarite').select('eleve_id, tranche, montant').eq('ecole_id', ec.id),
    ]);
    const toutes = (ech || []) as { id: string; label: string; montant: number; date_echeance: string; classe_id: string | null }[];
    if (!toutes.length) continue;
    const paye: Record<string, number> = {};
    for (const p of (paiements || []) as { eleve_id: string; tranche: string; montant: number }[]) {
      paye[`${p.eleve_id}|${p.tranche}`] = (paye[`${p.eleve_id}|${p.tranche}`] || 0) + Number(p.montant || 0);
    }
    for (const e of (eleves || []) as { id: string; nom: string; prenom: string; classe_id: string }[]) {
      const propres = toutes.filter((t) => t.classe_id === e.classe_id);
      const grille = propres.length ? propres : toutes.filter((t) => !t.classe_id);
      for (const t of grille) {
        const reste = Number(t.montant || 0) - (paye[`${e.id}|${t.label}`] || 0);
        if (reste <= 0) continue;
        const d = ecartJours(t.date_echeance, aujourdhui);
        const etape = d === 3 ? 'J-3' : d === 0 ? 'J' : d === -7 ? 'J+7' : null;
        if (!etape) continue;
        const { error: deja } = await admin.from('rappels_envoyes').insert({ ecole_id: ec.id, type: `scol|${e.id}|${t.id}|${etape}`, date: aujourdhui });
        if (deja) continue;
        const enfant = `${e.prenom} ${e.nom}`;
        const texte = etape === 'J-3'
          ? `Petit rappel : la tranche « ${t.label} » de ${enfant} (reste ${fcfa(reste)}) est à régler avant le ${jj(t.date_echeance)}. Merci !`
          : etape === 'J'
            ? `La tranche « ${t.label} » de ${enfant} (reste ${fcfa(reste)}) arrive à échéance aujourd’hui. Merci de passer au secrétariat.`
            : `La tranche « ${t.label} » de ${enfant} (reste ${fcfa(reste)}) n’est pas encore réglée (échéance du ${jj(t.date_echeance)}). Merci de passer au secrétariat ou de nous contacter.`;
        await admin.from('messages_internes').insert({ ecole_id: ec.id, destinataire_type: 'parent', eleve_id: e.id, contenu: '🎓 ' + texte, auteur_nom: ec.nom_ecole, auteur_id: null });
        const parents = await parentsDesEleves(admin, ec.id, [e.id]);
        await envoyerPush(admin, parents, { title: `${ec.nom_ecole} — scolarité`, body: texte, url: './parent.html', tag: `scol-${e.id}-${t.id}` });
        n++;
      }
    }
  }
  return n;
}

// Vœux d'anniversaire (schema.sql section 65) : à 8h, le jour de
// l'anniversaire d'un élève, ses parents reçoivent les vœux de l'école
// (notification + message). Une seule fois par élève et par an.
// deno-lint-ignore no-explicit-any
async function voeuxAnniversaire(admin: any, aujourdhui: string, minuteActuelle: number): Promise<number> {
  if (minuteActuelle < 8 * 60 || minuteActuelle > 8 * 60 + 30) return 0;
  const [an, mois, jour] = aujourdhui.split('-').map(Number);
  // Le 28 février d'une année non bissextile, on fête aussi les élèves nés le 29
  const bissextile = (an % 4 === 0 && an % 100 !== 0) || an % 400 === 0;
  const jours = mois === 2 && jour === 28 && !bissextile ? [28, 29] : [jour];
  const { data: ecoles } = await admin.from('ecoles').select('id, nom_ecole').eq('actif', true).eq('voeux_anniversaire', true);
  let n = 0;
  for (const ec of (ecoles || []) as { id: string; nom_ecole: string }[]) {
    const { data: eleves } = await admin.from('eleves').select('id, prenom, nom, date_naissance').eq('ecole_id', ec.id).eq('statut', 'Actif').not('date_naissance', 'is', null);
    for (const e of (eleves || []) as { id: string; prenom: string; nom: string; date_naissance: string }[]) {
      const [a, m, j] = String(e.date_naissance).slice(0, 10).split('-').map(Number);
      if (m !== mois || !jours.includes(j)) continue;
      const age = an - a;
      if (age <= 0 || age >= 30) continue;                        // date manifestement fausse
      const { error: deja } = await admin.from('rappels_envoyes').insert({ ecole_id: ec.id, type: `anniv|${e.id}`, date: aujourdhui });
      if (deja) continue;
      const texte = `Joyeux anniversaire ${e.prenom} ! Toute l’équipe de ${ec.nom_ecole} lui souhaite une très belle journée pour ses ${age} ans. 🎉`;
      await admin.from('messages_internes').insert({ ecole_id: ec.id, destinataire_type: 'parent', eleve_id: e.id, contenu: '🎂 ' + texte, auteur_nom: ec.nom_ecole, auteur_id: null });
      const parents = await parentsDesEleves(admin, ec.id, [e.id]);
      await envoyerPush(admin, parents, { title: `🎂 ${ec.nom_ecole}`, body: texte, url: './parent.html', tag: `anniv-${e.id}` });
      n++;
    }
  }
  return n;
}

// Résumé de la semaine (schema.sql section 69) : le vendredi à 17h30,
// chaque parent reçoit le bilan de ses enfants — présences de la semaine
// (si l'appel est fait), devoirs pour la semaine suivante, dates à venir.
// Une seule fois par parent et par semaine ; rien n'est envoyé s'il n'y a
// rien à dire.
// deno-lint-ignore no-explicit-any
async function resumeHebdo(admin: any, aujourdhui: string, minuteActuelle: number): Promise<number> {
  if (minuteActuelle < 17 * 60 + 30 || minuteActuelle > 18 * 60) return 0;
  const decale = (n: number) => { const d = new Date(aujourdhui + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const lundi = decale(-4), lundiProchain = decale(3), vendrediProchain = decale(7);
  const { data: ecoles } = await admin.from('ecoles').select('id, nom_ecole').eq('actif', true).eq('resume_hebdo', true);
  let n = 0;
  for (const ec of (ecoles || []) as { id: string; nom_ecole: string }[]) {
    const { data: liens } = await admin.from('parents_eleves').select('parent_profile_id, eleve_id').eq('ecole_id', ec.id);
    if (!liens || !liens.length) continue;
    const ids = [...new Set((liens as { eleve_id: string }[]).map((l) => l.eleve_id))];
    const [{ data: eleves }, { data: pres }, { data: devoirs }, { data: agenda }] = await Promise.all([
      admin.from('eleves').select('id, prenom, classe_id').eq('ecole_id', ec.id).eq('statut', 'Actif').in('id', ids),
      admin.from('presences_eleves').select('eleve_id, statut, date').eq('ecole_id', ec.id).in('eleve_id', ids).gte('date', lundi).lte('date', aujourdhui),
      admin.from('devoirs').select('classe_id').eq('ecole_id', ec.id).gte('pour_le', lundiProchain).lte('pour_le', vendrediProchain),
      admin.from('evenements_agenda').select('titre, date_debut, classe_ids').eq('ecole_id', ec.id).gte('date_debut', decale(1)).lte('date_debut', decale(10)).order('date_debut'),
    ]);
    const parParent: Record<string, string[]> = {};
    for (const l of liens as { parent_profile_id: string; eleve_id: string }[]) (parParent[l.parent_profile_id] ||= []).push(l.eleve_id);
    for (const [parentId, siens] of Object.entries(parParent)) {
      const enfants = ((eleves || []) as { id: string; prenom: string; classe_id: string }[]).filter((e) => siens.includes(e.id));
      if (!enfants.length) continue;
      const lignes: string[] = [];
      for (const e of enfants) {
        const p = ((pres || []) as { eleve_id: string; statut: string }[]).filter((x) => x.eleve_id === e.id);
        const morceaux: string[] = [];
        if (p.length) {
          const abs = p.filter((x) => x.statut === 'Absent').length, ret = p.filter((x) => x.statut === 'Retard').length;
          morceaux.push(abs || ret ? `${p.length - abs} jour(s) présent(e)${abs ? `, ${abs} absence(s)` : ''}${ret ? `, ${ret} retard(s)` : ''}` : `présent(e) tous les jours ✅`);
        }
        const nbDevoirs = ((devoirs || []) as { classe_id: string }[]).filter((d) => d.classe_id === e.classe_id).length;
        if (nbDevoirs) morceaux.push(`${nbDevoirs} devoir(s) noté(s) pour la semaine prochaine`);
        if (morceaux.length) lignes.push(`${e.prenom} : ${morceaux.join(' · ')}`);
      }
      const classes = enfants.map((e) => e.classe_id);
      const dates = ((agenda || []) as { titre: string; date_debut: string; classe_ids: string[] | null }[])
        .filter((a) => !a.classe_ids || a.classe_ids.some((c) => classes.includes(c))).slice(0, 2)
        .map((a) => `${a.titre} (${a.date_debut.split('-').reverse().slice(0, 2).join('/')})`);
      if (dates.length) lignes.push(`À venir : ${dates.join(', ')}`);
      if (!lignes.length) continue;
      const { error: deja } = await admin.from('rappels_envoyes').insert({ ecole_id: ec.id, type: `resume|${parentId}`, date: aujourdhui });
      if (deja) continue;
      await envoyerPush(admin, [parentId], { title: `📊 La semaine — ${ec.nom_ecole}`, body: lignes.join('\n').slice(0, 400), url: './parent.html', tag: 'resume-semaine' });
      n++;
    }
  }
  return n;
}

// Nouvelles pré-inscriptions en ligne (schema.sql section 71) : notification
// au secrétariat et à la direction, une seule fois par demande.
// deno-lint-ignore no-explicit-any
async function notifierPreinscriptions(admin: any, aujourdhui: string): Promise<number> {
  const depuis = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: nouvelles } = await admin.from('preinscriptions').select('id, ecole_id, enfant_prenom, enfant_nom, classe_souhaitee')
    .eq('statut', 'nouvelle').gte('created_at', depuis);
  let n = 0;
  for (const p of (nouvelles || []) as { id: string; ecole_id: string; enfant_prenom: string; enfant_nom: string; classe_souhaitee: string }[]) {
    const { error: deja } = await admin.from('rappels_envoyes').insert({ ecole_id: p.ecole_id, type: `preinsc|${p.id}`, date: aujourdhui });
    if (deja) continue;
    const { data: comptes } = await admin.from('profiles').select('id').eq('ecole_id', p.ecole_id).in('role', ['secretariat', 'direction']);
    await envoyerPush(admin, (comptes || []).map((c: { id: string }) => c.id), {
      title: '📥 Nouvelle pré-inscription', url: './index.html', tag: `preinsc-${p.id}`,
      body: `${p.enfant_prenom} ${p.enfant_nom}${p.classe_souhaitee ? ' (' + p.classe_souhaitee + ')' : ''} — à rappeler. Voir Élèves & Inscriptions.`,
    });
    n++;
  }
  return n;
}

// Rappel des devoirs (schema.sql section 64) : à 18h, la veille d'un jour
// de classe, les parents de chaque classe reçoivent la liste des devoirs
// prévus pour le lendemain. Une seule fois par classe et par jour.
// deno-lint-ignore no-explicit-any
async function rappelDevoirs(admin: any, aujourdhui: string, minuteActuelle: number): Promise<number> {
  if (minuteActuelle < 18 * 60 || minuteActuelle > 18 * 60 + 30) return 0;
  const d = new Date(aujourdhui + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  const demain = d.toISOString().slice(0, 10);
  const { data: devoirs } = await admin.from('devoirs').select('ecole_id, classe_id, matiere, travail').eq('pour_le', demain);
  const parClasse: Record<string, { ecole: string; classe: string; lignes: string[] }> = {};
  for (const dv of (devoirs || []) as { ecole_id: string; classe_id: string; matiere: string; travail: string }[]) {
    const k = `${dv.ecole_id}|${dv.classe_id}`;
    (parClasse[k] ||= { ecole: dv.ecole_id, classe: dv.classe_id, lignes: [] }).lignes.push(dv.matiere ? `${dv.matiere} : ${dv.travail}` : dv.travail);
  }
  let n = 0;
  for (const g of Object.values(parClasse)) {
    const { data: ec } = await admin.from('ecoles').select('nom_ecole, actif').eq('id', g.ecole).single();
    if (!ec || ec.actif === false) continue;
    const { error: deja } = await admin.from('rappels_envoyes').insert({ ecole_id: g.ecole, type: `devoirs|${g.classe}`, date: aujourdhui });
    if (deja) continue;
    const [{ data: classe }, { data: eleves }] = await Promise.all([
      admin.from('classes').select('nom').eq('id', g.classe).single(),
      admin.from('eleves').select('id').eq('ecole_id', g.ecole).eq('classe_id', g.classe).eq('statut', 'Actif'),
    ]);
    const parents = await parentsDesEleves(admin, g.ecole, (eleves || []).map((e: { id: string }) => e.id));
    if (!parents.length) continue;
    await envoyerPush(admin, parents, {
      title: `📒 Devoirs pour demain — ${classe?.nom || ''}`.trim(),
      body: g.lignes.join(' · ').slice(0, 300), url: './parent.html', tag: `devoirs-${g.classe}`,
    });
    n++;
  }
  return n;
}

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
      // Vacances inscrites à l'agenda de l'école (toute l'école) : pas d'annonces ni de rappel
      const { data: vacances } = await supabaseAdmin.from('evenements_agenda').select('id').eq('ecole_id', h.ecole_id)
        .eq('type', 'vacances').is('classe_ids', null).lte('date_debut', dateDuJour).gte('date_fin', dateDuJour).limit(1);
      if (vacances && vacances.length) continue;
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

      // Rappel « appel non fait » (schema.sql section 57) : une fois par jour,
      // dans la demi-heure qui suit l'heure du rappel.
      const rappel = String(h.rappel_appel || '').slice(0, 5);
      if (/^\d{2}:\d{2}$/.test(rappel) && minuteActuelle >= enMinutes(rappel) && minuteActuelle <= enMinutes(rappel) + 30) {
        try {
          const { data: classes } = await supabaseAdmin.from('classes').select('id, nom').eq('ecole_id', h.ecole_id);
          const { data: inscrits } = await supabaseAdmin.from('eleves').select('classe_id').eq('ecole_id', h.ecole_id).eq('statut', 'Actif');
          const { data: faits } = await supabaseAdmin.from('presences_eleves').select('classe_id').eq('ecole_id', h.ecole_id).eq('date', dateDuJour);
          const avecEleves = new Set((inscrits || []).map((e: { classe_id: string }) => e.classe_id));
          const appelFait = new Set((faits || []).map((p: { classe_id: string }) => p.classe_id));
          const manquantes = (classes || []).filter((c: { id: string }) => avecEleves.has(c.id) && !appelFait.has(c.id));
          if (manquantes.length) {
            const { error: dejaEnvoye } = await supabaseAdmin.from('rappels_envoyes')
              .insert({ ecole_id: h.ecole_id, type: 'appel', date: dateDuJour, details: { classes: manquantes.map((c: { nom: string }) => c.nom) } });
            if (!dejaEnvoye) {
              const noms = manquantes.map((c: { nom: string }) => c.nom);
              const { data: comptes } = await supabaseAdmin.from('profiles').select('id, role, enseignant_id').eq('ecole_id', h.ecole_id)
                .in('role', ['secretariat', 'direction', 'fondation', 'enseignant']);
              const admins = (comptes || []).filter((c: { role: string }) => c.role !== 'enseignant').map((c: { id: string }) => c.id);
              await envoyerPush(supabaseAdmin, admins, {
                title: '📋 Appel non fait', url: './index.html', tag: 'rappel-appel',
                body: `À ${lisible(rappel)}, l'appel n'est pas enregistré pour ${noms.length} classe(s) : ${noms.slice(0, 6).join(', ')}${noms.length > 6 ? '…' : ''}.`,
              });
              // Chaque enseignant : seulement ses classes
              const profs = (comptes || []).filter((c: { role: string; enseignant_id: string | null }) => c.role === 'enseignant' && c.enseignant_id);
              if (profs.length) {
                const { data: fiches } = await supabaseAdmin.from('enseignants').select('id, classes_assignees').in('id', profs.map((p: { enseignant_id: string }) => p.enseignant_id));
                for (const p of profs as { id: string; enseignant_id: string }[]) {
                  const sesClasses = ((fiches || []).find((f: { id: string }) => f.id === p.enseignant_id)?.classes_assignees || []) as string[];
                  const lesSiennes = manquantes.filter((c: { id: string }) => sesClasses.includes(c.id)).map((c: { nom: string }) => c.nom);
                  if (lesSiennes.length) await envoyerPush(supabaseAdmin, [p.id], { title: '📋 Pensez à l’appel', url: './index.html', tag: 'rappel-appel', body: `L'appel n'est pas encore enregistré pour ${lesSiennes.join(', ')}.` });
                }
              }
            }
          }
        } catch (e) { erreurs.push(`rappel appel: ${(e as Error).message}`); }
      }
    }

    // Relances de scolarité (schema.sql section 58) — en semaine, une fois par jour
    if (jourIso <= 5) {
      try { nbEnvoyees += await relancesScolarite(supabaseAdmin, dateDuJour, minuteActuelle); }
      catch (e) { erreurs.push(`relances: ${(e as Error).message}`); }
    }

    // Pré-inscriptions en ligne — à chaque passage
    try { nbEnvoyees += await notifierPreinscriptions(supabaseAdmin, dateDuJour); }
    catch (e) { erreurs.push(`preinscriptions: ${(e as Error).message}`); }

    // Vœux d'anniversaire — tous les jours à 8h
    try { nbEnvoyees += await voeuxAnniversaire(supabaseAdmin, dateDuJour, minuteActuelle); }
    catch (e) { erreurs.push(`anniversaires: ${(e as Error).message}`); }

    // Résumé de la semaine — le vendredi
    if (jourIso === 5) {
      try { nbEnvoyees += await resumeHebdo(supabaseAdmin, dateDuJour, minuteActuelle); }
      catch (e) { erreurs.push(`resume: ${(e as Error).message}`); }
    }

    // Rappel des devoirs du lendemain — dimanche à jeudi soir
    if (jourIso === 7 || jourIso <= 4) {
      try { nbEnvoyees += await rappelDevoirs(supabaseAdmin, dateDuJour, minuteActuelle); }
      catch (e) { erreurs.push(`devoirs: ${(e as Error).message}`); }
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
