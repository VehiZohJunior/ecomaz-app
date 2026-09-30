// =====================================================================
// EcoMaZ — Fonction Edge : remplissage intelligent des formulaires
// =====================================================================
// Reçoit une photo de document OU un enregistrement vocal, en extrait les
// informations pertinentes via l'API Anthropic (Claude), et renvoie un
// JSON { champ: { valeur, confiance } } — jamais de valeur inventée : un
// champ absent de la source devient valeur=null, confiance="faible".
//
// Sécurité :
// - Réservé au personnel administratif (secretariat/direction/fondation) —
//   jamais enseignant/parent/portier.
// - Quota mensuel par école (ecoles.limite_remplissage_mensuelle),
//   vérifié AVANT tout appel payant.
// - L'image/l'audio ne sont JAMAIS stockés : ils transitent en mémoire le
//   temps de la requête, transmis à Anthropic/Groq, puis oubliés. Seule
//   une ligne sans contenu est journalisée (qui, quel formulaire, quand)
//   pour suivre les coûts — voir schema.sql section 37.
// - Clés API (ANTHROPIC_API_KEY, GROQ_API_KEY) en secrets Supabase,
//   jamais exposées au client.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChampSchema {
  name: string;
  label: string;
  type: string;
  format?: string;
}

function normaliserTelephoneCI(tel: string): string {
  const digits = (tel || '').replace(/\D/g, '').replace(/^225/, '');
  if (digits.length !== 10) return tel;
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

function construireOutil(schema: ChampSchema[]) {
  const properties: Record<string, unknown> = {};
  for (const champ of schema) {
    properties[champ.name] = {
      type: 'object',
      description: `${champ.label}${champ.format ? ' — format attendu : ' + champ.format : ''}`,
      properties: {
        valeur: { type: ['string', 'null'] },
        confiance: { type: 'string', enum: ['élevé', 'moyen', 'faible'] },
      },
      required: ['valeur', 'confiance'],
    };
  }
  return {
    name: 'remplir_formulaire',
    description:
      "Extrait UNIQUEMENT les informations explicitement présentes dans le document ou la transcription fournie, pour chacun des champs demandés. N'invente JAMAIS une valeur : si une information est absente ou illisible, mets valeur à null et confiance à \"faible\". Si une valeur est clairement lisible/entendue, confiance \"élevé\" ; si elle demande une interprétation (écriture peu claire, son ambigu), confiance \"moyen\".",
    input_schema: { type: 'object', properties, required: schema.map((c) => c.name) },
  };
}

async function transcrireAudio(fichierBase64: string, mimeType: string): Promise<string> {
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) throw new Error('Transcription audio indisponible (clé non configurée)');
  const octets = Uint8Array.from(atob(fichierBase64), (c) => c.charCodeAt(0));
  const extension = mimeType.includes('ogg') || mimeType.includes('opus') ? 'ogg'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('wav') ? 'wav'
    : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : 'mp3';
  const formData = new FormData();
  formData.append('file', new Blob([octets], { type: mimeType }), `audio.${extension}`);
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'fr');

  const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: formData,
  });
  if (!resp.ok) {
    const texte = await resp.text().catch(() => '');
    throw new Error(`Transcription audio échouée (${resp.status}) — vérifiez que le fichier est audible et dans un format courant. ${texte.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!data.text || !data.text.trim()) throw new Error('Aucune parole détectée dans cet enregistrement');
  return data.text.trim();
}

async function appelerClaude(outil: ReturnType<typeof construireOutil>, contenu: unknown[]): Promise<Record<string, { valeur: string | null; confiance: string }>> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) throw new Error("Remplissage intelligent indisponible (clé non configurée)");

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system:
        "Tu extrais des informations pour une école en Côte d'Ivoire (application EcoMaZ). Réponds STRICTEMENT via l'outil fourni. Dates au format AAAA-MM-JJ. Noms de famille en MAJUSCULES, prénoms en casse normale. N'invente RIEN : une information absente = null. Ne complète jamais un champ par déduction si ce n'est pas écrit/dit explicitement.",
      tools: [outil],
      tool_choice: { type: 'tool', name: 'remplir_formulaire' },
      messages: [{ role: 'user', content: contenu }],
    }),
  });
  if (!resp.ok) {
    const texte = await resp.text().catch(() => '');
    throw new Error(`Analyse IA échouée (${resp.status}). ${texte.slice(0, 200)}`);
  }
  const data = await resp.json();
  const blocOutil = (data.content || []).find((b: { type: string }) => b.type === 'tool_use');
  if (!blocOutil) throw new Error("L'IA n'a pas pu extraire d'information exploitable — réessayez avec une photo plus nette ou un enregistrement plus clair.");
  return blocOutil.input;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabaseCaller.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profil } = await supabaseCaller.from('profiles').select('role, ecole_id').eq('id', user.id).single();
    if (!profil || !['secretariat', 'direction', 'fondation'].includes(profil.role)) {
      throw new Error('Réservé au personnel administratif');
    }

    const { formulaire, schema, typeSource, fichierBase64, mimeType } = await req.json();
    if (!formulaire || !Array.isArray(schema) || !schema.length || !typeSource || !fichierBase64) {
      throw new Error('Paramètres manquants');
    }
    if (!['photo', 'audio'].includes(typeSource)) throw new Error('Type de source invalide');

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Quota mensuel, vérifié AVANT tout appel payant.
    const { data: ecole } = await supabaseAdmin.from('ecoles').select('limite_remplissage_mensuelle').eq('id', profil.ecole_id).single();
    const limite = ecole?.limite_remplissage_mensuelle ?? 100;
    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin
      .from('usage_remplissage_intelligent')
      .select('id', { count: 'exact', head: true })
      .eq('ecole_id', profil.ecole_id)
      .gte('created_at', debutMois.toISOString());
    if ((count ?? 0) >= limite) {
      throw new Error(`Limite mensuelle de remplissages automatiques atteinte (${limite}). Contactez le développeur pour l'augmenter.`);
    }

    const outil = construireOutil(schema);
    let contenu: unknown[];
    if (typeSource === 'photo') {
      contenu = [
        { type: 'text', text: `Extrais les informations demandées à partir de ce document photographié, pour le formulaire "${formulaire}".` },
        { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: fichierBase64 } },
      ];
    } else {
      const transcription = await transcrireAudio(fichierBase64, mimeType || 'audio/webm');
      contenu = [
        { type: 'text', text: `Extrais les informations demandées à partir de cette transcription audio (langue française), pour le formulaire "${formulaire}" :\n\n"""${transcription}"""` },
      ];
    }

    const resultatBrut = await appelerClaude(outil, contenu);

    // Normalisation légère côté serveur, en filet de sécurité (l'utilisateur relit de toute façon).
    const resultat: Record<string, { valeur: string | null; confiance: string }> = {};
    for (const champ of schema as ChampSchema[]) {
      const r = resultatBrut[champ.name] || { valeur: null, confiance: 'faible' };
      let valeur = r.valeur;
      if (valeur && champ.type === 'tel') valeur = normaliserTelephoneCI(valeur);
      resultat[champ.name] = { valeur, confiance: r.confiance || 'faible' };
    }

    await supabaseAdmin.from('usage_remplissage_intelligent').insert({
      ecole_id: profil.ecole_id, utilisateur_id: user.id, formulaire, type_source: typeSource,
    });

    return new Response(JSON.stringify({ ok: true, resultat }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
