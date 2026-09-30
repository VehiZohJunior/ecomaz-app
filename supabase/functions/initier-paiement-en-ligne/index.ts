import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL du webhook (voir webhook-paiement-en-ligne) — PayDunya y postera la
// confirmation de paiement. URL fixe : ce projet Supabase ne change pas.
const WEBHOOK_URL = 'https://hvqtsvpkxffseclsfoun.supabase.co/functions/v1/webhook-paiement-en-ligne';
const RETOUR_URL = 'https://vehizohjunior.github.io/ecomaz-app/';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) Vérifier l'appelant avec SES droits (comme les autres fonctions).
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseCaller.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profil } = await supabaseCaller.from('profiles').select('role, ecole_id').eq('id', user.id).single();
    if (!profil || !profil.ecole_id) throw new Error('Compte non rattaché à une école');
    if (!['secretariat', 'direction', 'fondation'].includes(profil.role)) throw new Error('Rôle non autorisé à générer un lien de paiement');

    const { eleveId, tranche, montant } = await req.json();
    if (!eleveId || !tranche || !montant || montant <= 0) throw new Error('Paramètres manquants');

    // 2) Clé service_role pour lire la config + les identifiants PayDunya
    // (jamais transmis au client — voir schema.sql section 29).
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: config } = await supabaseAdmin
      .from('paiement_en_ligne_config').select('*').eq('ecole_id', profil.ecole_id).maybeSingle();
    if (!config || !config.actif || config.prestataire !== 'paydunya') {
      throw new Error("Le paiement en ligne n'est pas activé pour cette école (Paramètres → Paiement en ligne)");
    }

    const ident = config.identifiants || {};
    if (!ident.masterKey || !ident.privateKey || !ident.token) throw new Error('Identifiants PayDunya incomplets — vérifie Paramètres');

    const { data: eleve } = await supabaseAdmin
      .from('eleves').select('id, nom, prenom, parent_nom, parent_tel').eq('id', eleveId).eq('ecole_id', profil.ecole_id).single();
    if (!eleve) throw new Error("Élève introuvable dans votre école");

    const { data: ecole } = await supabaseAdmin.from('ecoles').select('nom_ecole').eq('id', profil.ecole_id).single();

    // Les clés PayDunya de test commencent par "test_" — on choisit
    // automatiquement l'environnement (sandbox ou production) en fonction
    // de la clé privée enregistrée, sans réglage supplémentaire à gérer.
    const estTest = String(ident.privateKey).startsWith('test_');
    const baseUrl = estTest ? 'https://app.paydunya.com/sandbox-api/v1' : 'https://app.paydunya.com/api/v1';

    const eleveNomComplet = `${eleve.prenom} ${eleve.nom}`;
    const corpsRequete = {
      invoice: {
        total_amount: Math.round(montant),
        description: `Scolarité — ${tranche} — ${eleveNomComplet}`,
        customer: {
          name: eleve.parent_nom || eleveNomComplet,
          phone: (eleve.parent_tel || '').replace(/\D/g, ''),
        },
      },
      store: { name: ecole?.nom_ecole || 'École' },
      custom_data: { ecole_id: profil.ecole_id, eleve_id: eleveId, tranche },
      actions: { callback_url: WEBHOOK_URL, return_url: RETOUR_URL, cancel_url: RETOUR_URL },
    };

    const reponsePaydunya = await fetch(`${baseUrl}/checkout-invoice/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': ident.masterKey,
        'PAYDUNYA-PRIVATE-KEY': ident.privateKey,
        'PAYDUNYA-TOKEN': ident.token,
      },
      body: JSON.stringify(corpsRequete),
    });
    const resultat = await reponsePaydunya.json();
    if (resultat.response_code !== '00') throw new Error(resultat.response_text || 'Échec de la création du lien de paiement');

    await supabaseAdmin.from('paiements_en_ligne').insert({
      ecole_id: profil.ecole_id,
      eleve_id: eleveId,
      tranche,
      montant: Math.round(montant),
      statut: 'en_attente',
      reference_prestataire: resultat.token,
    });

    return new Response(JSON.stringify({ ok: true, url: resultat.response_text, mode: estTest ? 'test' : 'production' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
