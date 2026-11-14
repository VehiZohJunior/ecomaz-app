// =====================================================================
// EcoMaZ — Fonction Edge : conversion d'un sujet d'évaluation
// =====================================================================
// « Je crée une évaluation » (schema.sql section 116) : l'enseignant
// photographie une feuille (ou importe un PDF scanné / un PDF texte) ;
// cette fonction en fait un document propre et MODIFIABLE (HTML simple :
// titres, consignes, exercices numérotés, tableaux), que l'application
// affiche, laisse modifier et exporte en Word / Excel.
//
// Moteur 100 % gratuit en premier : Groq (vision Llama 4 pour les photos,
// grand modèle texte pour un PDF texte). Anthropic seulement en secours
// si une clé existe.
//
// Sécurité : réservé aux enseignants inscrits (et au personnel
// administratif) ; quota mensuel commun avec le remplissage intelligent ;
// rien n'est stocké ici (une ligne d'usage sans contenu est journalisée).
// Le HTML renvoyé est de toute façon nettoyé à l'affichage (liste blanche).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

const MODELES_VISION = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
const MODELES_TEXTE = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'];
const CONSIGNE =
  "Tu recopies FIDÈLEMENT un sujet d'évaluation scolaire (école ivoirienne, en français) pour en faire un document modifiable. " +
  "Recopie TOUT le texte, mot pour mot, dans l'ordre, sans rien résumer, corriger, inventer ni ajouter (pas de réponses, pas de corrigé). " +
  "Garde la structure : titres et en-têtes, consignes, exercices et questions numérotés, barème, lignes à compléter (écris-les ainsi : ……………………), tableaux. " +
  "Un dessin ou une figure : écris [Figure : courte description] à sa place. Un mot illisible : [illisible]. " +
  "Réponds en JSON : {\"titre\": \"titre court du sujet ou null\", \"html\": \"le sujet en HTML\"}. " +
  "HTML autorisé UNIQUEMENT : h2, h3, p, strong, em, u, br, ol, ul, li, table, thead, tbody, tr, th, td. Aucun style, aucune classe, aucun script.";

let catalogueGroq: string[] | null = null;
async function choisirModeles(cle: string, preferes: string[], vision: boolean): Promise<string[]> {
  if (!catalogueGroq) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${cle}` } });
      const d = await r.json();
      catalogueGroq = (d?.data || []).filter((m: { active?: boolean }) => m.active !== false).map((m: { id: string }) => m.id);
    } catch { catalogueGroq = []; }
  }
  const dispo = catalogueGroq!;
  if (!dispo.length) return preferes;
  const ok = preferes.filter((m) => dispo.includes(m));
  const exclus = /whisper|guard|tts|playai|orpheus|distil|prompt-guard|compound/i;
  const candidats = dispo.filter((m) => !exclus.test(m) && !ok.includes(m));
  const extra = vision ? candidats.filter((m) => /llama-4|vision|scout|maverick|qwen.*vl|gemma-3/i.test(m))
    : candidats.filter((m) => /70b|120b|llama-4|maverick|scout|qwen|kimi|gpt-oss/i.test(m));
  return [...ok, ...extra].slice(0, 4);
}
type Sortie = { titre?: string | null; html?: string };
function lireJson(texte: string): Sortie {
  try { return JSON.parse(texte); } catch { /* suite */ }
  const m = texte.match(/\{[\s\S]*\}/); if (!m) throw new Error('réponse illisible');
  return JSON.parse(m[0]);
}
async function groq(messages: unknown[], vision: boolean): Promise<Sortie> {
  const cle = Deno.env.get('GROQ_API_KEY');
  if (!cle) throw new Error('GROQ_API_KEY absente');
  const modeles = await choisirModeles(cle, vision ? MODELES_VISION : MODELES_TEXTE, vision);
  let derniere = '';
  for (const modele of modeles) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modele, temperature: 0, max_tokens: 7000, response_format: { type: 'json_object' }, messages }),
    });
    if (resp.ok) {
      const d = await resp.json();
      try { return lireJson(d?.choices?.[0]?.message?.content || '{}'); } catch { derniere = 'réponse illisible'; continue; }
    }
    derniere = `${modele} → ${resp.status} ${(await resp.text().catch(() => '')).slice(0, 120)}`;
  }
  throw new Error('Groq : ' + derniere);
}
async function claudeSecours(contenu: unknown[]): Promise<Sortie> {
  const cle = Deno.env.get('ANTHROPIC_API_KEY');
  if (!cle) throw new Error('pas de secours');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 7000, system: CONSIGNE, messages: [{ role: 'user', content: contenu }] }),
  });
  if (!resp.ok) throw new Error('secours ' + resp.status);
  const d = await resp.json();
  return lireJson(d?.content?.[0]?.text || '');
}
// Défense supplémentaire : seules les balises autorisées, sans attribut
function nettoyer(html: string): string {
  return String(html || '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (t, nom: string) => {
      const n = nom.toLowerCase();
      if (!['h2', 'h3', 'p', 'strong', 'em', 'u', 'br', 'ol', 'ul', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td'].includes(n)) return '';
      return t.startsWith('</') ? `</${n}>` : `<${n}>`;
    }).trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non authentifié');
    const url = Deno.env.get('SUPABASE_URL')!;
    const appelant = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await appelant.auth.getUser();
    if (!user) throw new Error('Non authentifié');
    const { data: profil } = await appelant.from('profiles').select('role, ecole_id, enseignant_id').eq('id', user.id).single();
    const autorise = profil?.ecole_id && ((profil.role === 'enseignant' && profil.enseignant_id) || ['secretariat', 'direction', 'fondation'].includes(profil.role));
    if (!autorise) throw new Error('Réservé aux enseignants inscrits');

    const { typeSource, photos, mimeType, texte } = await req.json();
    if (!['photo', 'document'].includes(typeSource)) throw new Error('Type de source invalide');
    const images: string[] = Array.isArray(photos) ? photos.slice(0, 4) : [];
    if (typeSource === 'photo' && (!images.length || images.some((p) => typeof p !== 'string' || p.length > 5_500_000))) throw new Error('Photo absente ou trop lourde (4 Mo maximum par page).');
    if (typeSource === 'document' && (typeof texte !== 'string' || texte.trim().length < 5 || texte.length > 30000)) throw new Error('Document vide ou trop long (30 000 caractères au maximum).');

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ecole } = await admin.from('ecoles').select('limite_remplissage_mensuelle').eq('id', profil!.ecole_id).single();
    const limite = ecole?.limite_remplissage_mensuelle ?? 100;
    const debutMois = new Date(); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from('usage_remplissage_intelligent').select('id', { count: 'exact', head: true })
      .eq('ecole_id', profil!.ecole_id).gte('created_at', debutMois.toISOString());
    if ((count ?? 0) >= limite) throw new Error(`Limite mensuelle de conversions automatiques atteinte (${limite}). Vous pouvez saisir le sujet directement.`);

    let sortie: Sortie; let moteur = 'groq';
    if (typeSource === 'photo') {
      const mt = mimeType || 'image/jpeg';
      try {
        sortie = await groq([{ role: 'system', content: CONSIGNE }, { role: 'user', content: [
          { type: 'text', text: images.length > 1 ? `Voici les ${images.length} pages du sujet, dans l'ordre. Recopie-les toutes à la suite.` : 'Voici la photo du sujet. Recopie-le.' },
          ...images.map((p) => ({ type: 'image_url', image_url: { url: `data:${mt};base64,${p}` } }))] }], true);
      } catch (e) {
        moteur = 'secours';
        sortie = await claudeSecours([{ type: 'text', text: 'Recopie ce sujet.' }, ...images.map((p) => ({ type: 'image', source: { type: 'base64', media_type: mt, data: p } }))])
          .catch(() => { throw new Error('Conversion impossible pour le moment (' + (e as Error).message.slice(0, 80) + '). Réessayez dans un instant.'); });
      }
    } else {
      const contenu = `Texte brut extrait d'un PDF (mise en page perdue). Remets-le en forme sans rien changer au texte :\n"""${String(texte).trim()}"""`;
      try { sortie = await groq([{ role: 'system', content: CONSIGNE }, { role: 'user', content: contenu }], false); }
      catch (e) {
        moteur = 'secours';
        sortie = await claudeSecours([{ type: 'text', text: contenu }])
          .catch(() => { throw new Error('Conversion impossible pour le moment (' + (e as Error).message.slice(0, 80) + '). Réessayez dans un instant.'); });
      }
    }
    const html = nettoyer(sortie?.html || '');
    if (html.replace(/<[^>]*>/g, '').trim().length < 5) throw new Error('Aucun texte lisible : reprenez la photo bien à plat, avec plus de lumière.');
    await admin.from('usage_remplissage_intelligent').insert({ ecole_id: profil!.ecole_id, utilisateur_id: user.id, formulaire: 'sujet-evaluation', type_source: typeSource });
    return json({ ok: true, titre: typeof sortie.titre === 'string' ? sortie.titre.slice(0, 160) : null, html, moteur });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});
