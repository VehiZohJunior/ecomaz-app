import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PayDunya nous prouve que la notification vient bien d'eux en renvoyant
// le SHA-512 de notre MasterKey (voir doc "CONFIGURING IPN") — c'est la
// vérification obligatoire avant de créer quoi que ce soit.
async function sha512Hex(texte: string): Promise<string> {
  const octets = new TextEncoder().encode(texte);
  const empreinte = await crypto.subtle.digest('SHA-512', octets);
  return Array.from(new Uint8Array(empreinte)).map((o) => o.toString(16).padStart(2, '0')).join('');
}

// Comparaison sans fuite de temps (la durée de la réponse ne révèle pas
// combien de caractères du hash étaient justes).
function egaliteConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// PayDunya poste en application/x-www-form-urlencoded avec des clés du
// type "data[invoice][token]" — on reconstruit l'objet imbriqué.
function reconstituerObjet(formData: FormData): Record<string, unknown> {
  const racine: Record<string, unknown> = {};
  for (const [cle, valeur] of formData.entries()) {
    const chemin = cle.replace(/\]/g, '').split('[');
    let noeud: Record<string, unknown> = racine;
    for (let i = 0; i < chemin.length - 1; i++) {
      const k = chemin[i];
      if (typeof noeud[k] !== 'object' || noeud[k] === null) noeud[k] = {};
      noeud = noeud[k] as Record<string, unknown>;
    }
    noeud[chemin[chemin.length - 1]] = valeur;
  }
  return racine;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  // PayDunya attend un accusé de réception rapide. On répond toujours 200
  // (même en cas de rejet) pour éviter des tentatives de renvoi infinies —
  // seule une notification jugée invalide n'a simplement aucun effet.
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const formData = await req.formData();
    const analyse = reconstituerObjet(formData) as { data?: Record<string, any> };
    const donnees = analyse.data;
    if (!donnees) throw new Error('Corps de notification invalide');

    const ecoleId = donnees.custom_data?.ecole_id;
    const invoiceToken = donnees.invoice?.token;
    const hashRecu = donnees.hash;
    if (!ecoleId || !invoiceToken || !hashRecu) throw new Error('Champs requis manquants dans la notification');

    const { data: config } = await supabaseAdmin
      .from('paiement_en_ligne_config').select('identifiants').eq('ecole_id', ecoleId).maybeSingle();
    const masterKey = config?.identifiants?.masterKey;
    if (!masterKey) throw new Error('Configuration PayDunya introuvable pour cette école');

    const hashAttendu = await sha512Hex(masterKey);
    if (!egaliteConstante(hashAttendu, String(hashRecu))) throw new Error('Hash de vérification invalide — notification rejetée (pas confirmée PayDunya)');

    const { data: ligne } = await supabaseAdmin
      .from('paiements_en_ligne').select('*').eq('ecole_id', ecoleId).eq('reference_prestataire', invoiceToken).maybeSingle();
    if (!ligne) throw new Error('Paiement en ligne introuvable pour ce jeton');
    if (ligne.statut !== 'en_attente') throw new Error('Paiement déjà traité');

    // On ne croit pas la notification sur parole : on redemande à PayDunya
    // le statut et le montant réels de la facture (API « confirm »).
    const ident = config.identifiants;
    if (String(ident.privateKey || '').startsWith('test_')) throw new Error('Clés de test : paiement ignoré');
    const rep = await fetch(`https://app.paydunya.com/api/v1/checkout-invoice/confirm/${encodeURIComponent(invoiceToken)}`, {
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': ident.masterKey,
        'PAYDUNYA-PRIVATE-KEY': ident.privateKey,
        'PAYDUNYA-TOKEN': ident.token,
      },
    });
    const confirme = await rep.json();
    if (confirme.response_code !== '00') throw new Error('Facture introuvable chez PayDunya');
    if (confirme.mode && confirme.mode !== 'live') throw new Error('Paiement de test ignoré');
    const statutReel = confirme.status;

    if (statutReel === 'completed') {
      const montant = Math.round(Number(confirme.invoice?.total_amount));
      // Le montant payé doit être exactement celui du lien créé par l'école
      if (montant !== Math.round(Number(ligne.montant))) throw new Error(`Montant différent de celui attendu (${montant} au lieu de ${ligne.montant})`);

      // Verrou : un seul passage peut faire passer la ligne de « en_attente »
      // à « reussi » (si PayDunya envoie deux fois la notification, le
      // paiement n'est enregistré qu'une fois).
      const { data: verrou } = await supabaseAdmin.from('paiements_en_ligne')
        .update({ statut: 'reussi', updated_at: new Date().toISOString() })
        .eq('id', ligne.id).eq('statut', 'en_attente').select('id');
      if (!verrou || verrou.length === 0) throw new Error('Paiement déjà traité');

      const { data: paiement } = await supabaseAdmin.from('paiements_scolarite').insert({
        ecole_id: ecoleId,
        eleve_id: ligne.eleve_id,
        montant,
        tranche: ligne.tranche,
        date: new Date().toISOString().slice(0, 10),
        mode_paiement: 'Mobile Money',
      }).select().single();

      await supabaseAdmin.from('paiements_en_ligne').update({
        paiement_scolarite_id: paiement?.id ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', ligne.id);

      if (paiement) {
        await supabaseAdmin.from('journal_compta').insert({
          ecole_id: ecoleId,
          table_cible: 'paiements_scolarite',
          enregistrement_id: paiement.id,
          action: 'creation',
          donnees_apres: paiement,
          auteur_nom: 'Paiement en ligne (PayDunya)',
          auteur_role: 'systeme',
        });
      }
    } else if (statutReel === 'failed' || statutReel === 'cancelled') {
      await supabaseAdmin.from('paiements_en_ligne').update({
        statut: statutReel === 'failed' ? 'echoue' : 'expire',
        updated_at: new Date().toISOString(),
      }).eq('id', ligne.id).eq('statut', 'en_attente');
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
