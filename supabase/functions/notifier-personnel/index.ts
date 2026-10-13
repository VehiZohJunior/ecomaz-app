// =====================================================================
// EcoMaZ — Fonction Edge : notifier l'école d'une action d'un parent
// =====================================================================
// Appelée par l'application des parents juste après :
//   - une demande d'accès (compte Google pas encore validé) → Direction / Fondation
//   - une absence signalée à l'avance → secrétariat, Direction et enseignant(s) de la classe
//   - un objet perdu signalé → secrétariat et Direction
//   - un message écrit à l'école → secrétariat, Direction, Fondation
// Sécurité : la fonction ne fait confiance à rien de ce que le navigateur
// envoie, sauf le type. Elle retrouve elle-même le DERNIER enregistrement
// fait par l'appelant (moins de 5 minutes) et compose le message.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envoyerPush } from '../_shared/push.ts';

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
    const { type } = await req.json();
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const depuis = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let ecoleId = '', roles: string[] = [], classeId: string | null = null, titre = '', texte = '', page = './index.html';
    if (type === 'demande_acces') {
      const { data: d } = await admin.from('demandes_acces').select('ecole_id, nom, role_demande').eq('user_id', user.id)
        .eq('statut', 'en_attente').gte('created_at', depuis).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!d) throw new Error('Demande introuvable');
      ecoleId = d.ecole_id; roles = ['direction', 'fondation'];
      titre = '🔔 Nouvelle demande d’accès';
      texte = `${d.nom || 'Quelqu’un'} demande l’accès ${d.role_demande === 'portier' ? 'PORTIER' : 'PARENT'}. À valider dans Paramètres → Demandes d’accès.`;
    } else if (type === 'absence') {
      const { data: a } = await admin.from('absences_signalees').select('ecole_id, eleve_id, date_debut, date_fin, motif')
        .eq('parent_id', user.id).gte('created_at', depuis).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!a) throw new Error('Signalement introuvable');
      const { data: e } = await admin.from('eleves').select('nom, prenom, classe_id').eq('id', a.eleve_id).single();
      ecoleId = a.ecole_id; roles = ['secretariat', 'direction', 'fondation', 'enseignant']; classeId = e?.classe_id || null;
      const quand = a.date_debut === a.date_fin ? `le ${a.date_debut.split('-').reverse().join('/')}` : `du ${a.date_debut.split('-').reverse().join('/')} au ${a.date_fin.split('-').reverse().join('/')}`;
      titre = '📝 Absence signalée par un parent';
      texte = `${e ? e.prenom + ' ' + e.nom : 'Un élève'} sera absent(e) ${quand} (${a.motif}).`;
    } else if (type === 'objet_perdu') {
      const { data: o } = await admin.from('objets_perdus').select('ecole_id, eleve_id, objet')
        .eq('parent_id', user.id).gte('created_at', depuis).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!o) throw new Error('Signalement introuvable');
      const { data: e } = await admin.from('eleves').select('nom, prenom').eq('id', o.eleve_id).single();
      ecoleId = o.ecole_id; roles = ['secretariat', 'direction'];
      titre = '🎒 Objet perdu signalé';
      texte = `${o.objet} — ${e ? e.prenom + ' ' + e.nom : 'un élève'}. À traiter dans la Messagerie.`;
    } else if (type === 'message') {
      const { data: m } = await admin.from('messages_internes').select('ecole_id, eleve_id, contenu, auteur_nom')
        .eq('auteur_id', user.id).eq('destinataire_type', 'ecole').gte('created_at', depuis).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!m) throw new Error('Message introuvable');
      const { data: e } = await admin.from('eleves').select('nom, prenom').eq('id', m.eleve_id).single();
      ecoleId = m.ecole_id; roles = ['secretariat', 'direction', 'fondation'];
      titre = `✉️ Message de ${m.auteur_nom || 'un parent'}`;
      texte = `${e ? '(' + e.prenom + ' ' + e.nom + ') ' : ''}${String(m.contenu).slice(0, 160)}`;
    } else if (type === 'correction') {
      const { data: c } = await admin.from('corrections_fiches').select('ecole_id, eleve_id')
        .eq('demande_par', user.id).eq('statut', 'en_attente').gte('created_at', depuis).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!c) throw new Error('Demande introuvable');
      const { data: e } = await admin.from('eleves').select('nom, prenom').eq('id', c.eleve_id).single();
      ecoleId = c.ecole_id; roles = ['secretariat', 'direction'];
      titre = '✏️ Correction de fiche proposée';
      texte = `Un parent propose de corriger la fiche de ${e ? e.prenom + ' ' + e.nom : 'son enfant'}. À valider dans Élèves & Inscriptions.`;
    } else if (type === 'document') {
      const { data: d } = await admin.from('demandes_documents').select('ecole_id, eleve_id, type')
        .eq('demande_par', user.id).eq('statut', 'en_attente').gte('created_at', depuis).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!d) throw new Error('Demande introuvable');
      const { data: e } = await admin.from('eleves').select('nom, prenom').eq('id', d.eleve_id).single();
      ecoleId = d.ecole_id; roles = ['secretariat', 'direction'];
      titre = '📄 Document demandé par un parent';
      texte = `${d.type === 'certificat_scolarite' ? 'Certificat de scolarité' : 'Document'} pour ${e ? e.prenom + ' ' + e.nom : 'un élève'}. À préparer dans Élèves & Inscriptions.`;
    } else {
      throw new Error('Type inconnu');
    }

    // Destinataires : comptes de l'école ayant ces rôles ; un enseignant
    // seulement si la classe de l'élève fait partie de ses classes.
    const { data: comptes } = await admin.from('profiles').select('id, role, enseignant_id').eq('ecole_id', ecoleId).in('role', roles);
    let cibles = (comptes || []).filter((c: { role: string }) => c.role !== 'enseignant').map((c: { id: string }) => c.id);
    const profs = (comptes || []).filter((c: { role: string; enseignant_id: string | null }) => c.role === 'enseignant' && c.enseignant_id);
    if (classeId && profs.length) {
      const { data: fiches } = await admin.from('enseignants').select('id, classes_assignees').in('id', profs.map((p: { enseignant_id: string }) => p.enseignant_id));
      const ok = new Set((fiches || []).filter((f: { classes_assignees: string[] | null }) => (f.classes_assignees || []).includes(classeId!)).map((f: { id: string }) => f.id));
      cibles = cibles.concat(profs.filter((p: { enseignant_id: string }) => ok.has(p.enseignant_id)).map((p: { id: string }) => p.id));
    }
    const r = await envoyerPush(admin, cibles, { title: titre, body: texte, url: page, tag: `${type}-${Date.now()}` });
    return json({ ok: true, destinataires: cibles.length, ...r });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});
