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
    const estParent = profil.role === 'parent';
    if (!estParent && !['secretariat', 'direction', 'fondation'].includes(profil.role)) throw new Error('Rôle non autorisé à générer un lien de paiement');

    const corps = await req.json();
    const { eleveId, tranche } = corps;
    let montant = Number(corps.montant || 0);
    if (!eleveId || !tranche || (!estParent && !montant)) throw new Error('Paramètres manquants');
    if (typeof tranche !== 'string' || tranche.length > 60) throw new Error('Tranche invalide');

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
      .from('eleves').select('id, nom, prenom, parent_nom, parent_tel, classe_id').eq('id', eleveId).eq('ecole_id', profil.ecole_id).single();
    if (!eleve) throw new Error("Élève introuvable dans votre école");

    // Parent : seulement SON enfant, seulement une tranche existante, jamais plus que le reste dû (calculé ici)
    if (estParent) {
      // Garde-fou « double paiement » : tant que l'école n'a saisi aucun versement, les restes dus seraient faux
      const { count: nbVersements } = await supabaseAdmin.from('paiements_scolarite').select('id', { count: 'exact', head: true }).eq('ecole_id', profil.ecole_id);
      if (!nbVersements) throw new Error("L'école n'a pas encore enregistré les versements déjà reçus : le paiement en ligne sera possible dès que ce sera fait (vous pouvez payer au secrétariat)");
      const { data: lien } = await supabaseAdmin.from('parents_eleves').select('eleve_id').eq('parent_profile_id', user.id).eq('eleve_id', eleveId).maybeSingle();
      if (!lien) throw new Error("Cet élève n'est pas relié à votre compte");
      const { data: ech } = await supabaseAdmin.from('echeances_scolarite').select('label, montant, classe_id').eq('ecole_id', profil.ecole_id);
      const toutes = (ech || []) as { label: string; montant: number; classe_id: string | null }[];
      const propres = toutes.filter((t) => t.classe_id === eleve.classe_id);
      const grille = propres.length ? propres : toutes.filter((t) => !t.classe_id);
      const t = grille.find((x) => x.label === tranche);
      if (!t) throw new Error('Tranche inconnue');
      const { data: deja } = await supabaseAdmin.from('paiements_scolarite').select('montant').eq('ecole_id', profil.ecole_id).eq('eleve_id', eleveId).eq('tranche', tranche);
      const reste = Number(t.montant || 0) - ((deja || []) as { montant: number }[]).reduce((s, p) => s + Number(p.montant || 0), 0);
      if (reste <= 0) throw new Error('Cette tranche est déjà réglée');
      montant = reste;
    }
    // Montant entier, positif et raisonnable (aucune scolarité ne dépasse 5 000 000 F CFA)
    const montantEntier = Math.round(Number(montant));
    if (!Number.isFinite(montantEntier) || montantEntier < 100 || montantEntier > 5000000) throw new Error('Montant invalide');

    const { data: ecole } = await supabaseAdmin.from('ecoles').select('nom_ecole').eq('id', profil.ecole_id).single();

    // Application en service chez de vraies écoles : les clés PayDunya de
    // test (« test_… ») sont refusées, pour qu'aucun faux paiement ne se
    // mélange à la vraie comptabilité.
    if (String(ident.privateKey).startsWith('test_')) throw new Error('Clés PayDunya de test : enregistrez les clés de production (Console Développeur)');
    const baseUrl = 'https://app.paydunya.com/api/v1';

    const eleveNomComplet = `${eleve.prenom} ${eleve.nom}`;
    const corpsRequete = {
      invoice: {
        total_amount: montantEntier,
        description: `Scolarité — ${tranche} — ${eleveNomComplet}`,
        customer: {
          name: eleve.parent_nom || eleveNomComplet,
          phone: (eleve.parent_tel || '').replace(/\D/g, ''),
        },
      },
      store: { name: ecole?.nom_ecole || 'École' },
      custom_data: { ecole_id: profil.ecole_id, eleve_id: eleveId, tranche },
      actions: { callback_url: WEBHOOK_URL, return_url: estParent ? RETOUR_URL + 'parent.html?paiement=retour' : RETOUR_URL, cancel_url: estParent ? RETOUR_URL + 'parent.html?paiement=annule' : RETOUR_URL },
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

    const { error: errInsert } = await supabaseAdmin.from('paiements_en_ligne').insert({
      ecole_id: profil.ecole_id,
      eleve_id: eleveId,
      tranche,
      montant: montantEntier,
      statut: 'en_attente',
      reference_prestataire: resultat.token,
    });
    // Sans cette ligne, le paiement ne pourrait pas être rattaché à l'élève :
    // on ne donne pas le lien.
    if (errInsert) throw new Error('Lien non créé (enregistrement impossible), réessayez');

    return new Response(JSON.stringify({ ok: true, url: resultat.response_text, mode: 'production', montant: montantEntier }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
