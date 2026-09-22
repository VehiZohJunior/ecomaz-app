// =====================================================================
// EcoMaZ — Fonction Edge : envoi de SMS réels via Africa's Talking
// =====================================================================
// À déployer via Supabase Dashboard → Edge Functions → "Deploy a new
// function" (copier-coller ce code, nommer la fonction "envoyer-sms").
//
// Secrets requis (Supabase Dashboard → Edge Functions → Manage secrets) :
//   AT_USERNAME  → "sandbox" pour tester, puis le vrai nom d'app en prod
//   AT_API_KEY   → la clé API Africa's Talking (jamais dans le code client)
//   AT_SANDBOX   → "true" en test, "false" une fois en production
//
// Sécurité : seul un utilisateur EcoMaZ authentifié peut appeler cette
// fonction (vérifié ci-dessous) — elle est inaccessible publiquement.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');

    // Vérifie que l'appelant est bien un utilisateur EcoMaZ connecté
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { to, message } = await req.json();
    if (!to || !message) throw new Error('Paramètres manquants (to, message)');

    const AT_USERNAME = Deno.env.get('AT_USERNAME')!;
    const AT_API_KEY = Deno.env.get('AT_API_KEY')!;
    const sandbox = (Deno.env.get('AT_SANDBOX') ?? 'true') === 'true';
    const baseUrl = sandbox
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging';

    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        apiKey: AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ username: AT_USERNAME, to, message }),
    });
    const rawText = await resp.text();
    let result;
    try { result = JSON.parse(rawText); } catch { result = { raw: rawText }; }

    return new Response(JSON.stringify({ ok: true, sandbox, result }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
