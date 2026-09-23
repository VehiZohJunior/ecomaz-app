import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function heureActuelle(): string {
  return new Date().toISOString().slice(11, 16);
}
function normaliserTelephoneCI(tel: string): string {
  let digits = (tel || '').replace(/\D/g, '');
  if (digits.startsWith('225')) digits = digits.slice(3);
  return '+225' + digits;
}
function composeMsgAbsenceEleve(nomEcole: string, eleveNomComplet: string, classeNom: string, date: string, motif: string): string {
  return `Bonjour, nous vous informons que ${eleveNomComplet} (${classeNom}) est ABSENT(E) de l'école ce ${fmtDate(date)}${motif ? ` (motif signalé : ${motif})` : ''}. Merci de contacter l'établissement pour toute justification. — ${nomEcole}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) Vérifier l'appelant avec SES droits (clé anon + son propre jeton).
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseCaller.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profil } = await supabaseCaller.from('profiles').select('role, ecole_id, enseignant_id').eq('id', user.id).single();
    if (!profil || !profil.ecole_id) throw new Error('Compte non rattaché à une école');

    const { eleveId, date, motif } = await req.json();
    if (!eleveId || !date) throw new Error('Paramètres manquants');

    // 2) À partir d'ici, clé service_role — mais le numéro du parent n'est
    // JAMAIS renvoyé au client : il reste entièrement côté serveur, du
    // chargement jusqu'à l'appel SMS.
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: eleve, error: errEleve } = await supabaseAdmin
      .from('eleves').select('id, ecole_id, classe_id, nom, prenom, parent_nom, parent_tel')
      .eq('id', eleveId).eq('ecole_id', profil.ecole_id).single();
    if (errEleve || !eleve) throw new Error("Élève introuvable dans votre école");

    // Un compte enseignant relié à une fiche précise ne peut déclencher une
    // notification que pour SES classes assignées (même règle que pour la
    // lecture des notes/présences — voir schema.sql section 13).
    if (profil.role === 'enseignant' && profil.enseignant_id) {
      const { data: ens } = await supabaseAdmin.from('enseignants').select('classes_assignees').eq('id', profil.enseignant_id).single();
      const mesClasses: string[] = ens?.classes_assignees || [];
      if (!mesClasses.includes(eleve.classe_id)) throw new Error("Cet élève n'est pas dans vos classes");
    }

    const { data: classe } = await supabaseAdmin.from('classes').select('nom').eq('id', eleve.classe_id).single();
    const { data: ecole } = await supabaseAdmin.from('ecoles').select('nom_ecole, directeur_nom, fondateur_nom').eq('id', profil.ecole_id).single();

    const nomEcole = ecole?.nom_ecole || 'École';
    const eleveNomComplet = `${eleve.prenom} ${eleve.nom}`;
    const classeNom = classe?.nom || '—';
    const contenu = composeMsgAbsenceEleve(nomEcole, eleveNomComplet, classeNom, date, motif || '');
    const heure = heureActuelle();

    const destinataires = [
      { destinataire_nom: eleve.parent_nom, destinataire_role: 'Parent', destinataire_tel: eleve.parent_tel || '', canal: 'SMS' },
      { destinataire_nom: ecole?.directeur_nom || 'Direction', destinataire_role: 'Directeur', destinataire_tel: '', canal: 'Application' },
      { destinataire_nom: ecole?.fondateur_nom || 'Fondation', destinataire_role: 'Fondateur', destinataire_tel: '', canal: 'Application' },
    ].map(d => ({ ...d, ecole_id: profil.ecole_id, date, heure, type: 'Absence élève', contenu, eleve_id: eleveId }));

    const { data: inserted, error: errMsg } = await supabaseAdmin.from('messages').insert(destinataires).select();
    if (errMsg) throw errMsg;

    // 3) SMS réel au parent uniquement (Direction/Fondation = notification
    // interne à l'appli, déjà déclenchée via l'insertion ci-dessus).
    let smsOk = false;
    if (eleve.parent_tel) {
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
          body: new URLSearchParams({ username: AT_USERNAME, to: normaliserTelephoneCI(eleve.parent_tel), message: contenu }),
        });
        smsOk = resp.ok;
      } catch (_e) {
        smsOk = false;
      }
      const msgParent = (inserted || []).find((m: { destinataire_role: string }) => m.destinataire_role === 'Parent');
      if (msgParent) {
        await supabaseAdmin.from('messages').update({ statut: smsOk ? 'Envoyé' : 'Échec envoi' }).eq('id', msgParent.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, smsEnvoye: smsOk }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
