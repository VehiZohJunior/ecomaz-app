// =====================================================================
// EcoMaZ — Fonction Edge : remplissage intelligent des formulaires
// =====================================================================
// Reçoit 1 ou 2 photos d'un document, un enregistrement vocal, OU un texte
// collé (ex. message WhatsApp d'un parent), en extrait les informations du
// formulaire et renvoie { champ: { valeur, confiance } }.
//
// Moteur (2026-10-14, demande « outils 100 % gratuits ») :
// - Groq (offre gratuite) EN PREMIER : vision Llama 4 pour les photos,
//   Llama 3.3 pour le texte, Whisper pour la voix.
// - Anthropic seulement en secours, si Groq ne répond pas et qu'une clé
//   existe (ANTHROPIC_API_KEY) — modèle claude-sonnet-5-5.
//
// Fiabilité : chaque valeur est vérifiée et mise au bon format CÔTÉ
// SERVEUR (dates AAAA-MM-JJ plausibles, sexe M/F, NOM en majuscules,
// téléphone ivoirien) ; une valeur impossible est retirée (null) plutôt
// qu'inventée. Rien n'est jamais enregistré : la personne relit.
//
// Sécurité :
// - Réservé au personnel administratif (secretariat/direction/fondation).
// - Quota mensuel par école (ecoles.limite_remplissage_mensuelle).
// - Taille limitée (photos ≤ 2 × 4 Mo, audio ≤ 8 Mo, texte ≤ 4000 car.).
// - Image, audio et texte ne sont JAMAIS stockés ; seule une ligne sans
//   contenu est journalisée (qui, quel formulaire, quand).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

interface ChampSchema { name: string; label: string; type: string; format?: string }
type Resultat = Record<string, { valeur: string | null; confiance: string }>;

const MODELES_VISION = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
const MODELES_TEXTE = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'];
const CONSIGNE =
  "Tu extrais des informations pour une école en Côte d'Ivoire (application EcoMaZ). " +
  "Réponds UNIQUEMENT par un objet JSON. Pour chaque champ demandé : {\"valeur\": texte ou null, \"confiance\": \"élevé\"|\"moyen\"|\"faible\"}. " +
  "N'invente RIEN : information absente ou illisible = valeur null et confiance \"faible\". " +
  "Lisible sans doute = \"élevé\" ; demande une interprétation (écriture peu claire, son ambigu) = \"moyen\". " +
  "Dates au format AAAA-MM-JJ. Sexe : \"M\" ou \"F\". NOM de famille en MAJUSCULES, prénoms en casse normale. " +
  "Téléphone : les 10 chiffres ivoiriens, sans indicatif.";

function descriptionChamps(schema: ChampSchema[]) {
  return schema.map((c) => `- "${c.name}" : ${c.label}${c.format ? ' (format : ' + c.format + ')' : ''}`).join('\n');
}

// ---------- Normalisation (filet de sécurité côté serveur) ----------
const MOIS: Record<string, number> = { janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12 };
function normaliserDate(v: string): string | null {
  const s = v.trim().toLowerCase();
  let a = 0, m = 0, j = 0;
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (r) { a = +r[1]; m = +r[2]; j = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) { j = +r[1]; m = +r[2]; a = +r[3]; if (a < 100) a += a > 40 ? 1900 : 2000; }
  else if ((r = s.match(/^(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})$/))) { j = +r[1]; m = MOIS[r[2]] || 0; a = +r[3]; }
  else return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (!m || d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return null;
  if (a < 1940 || d.getTime() > Date.now()) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}
function normaliserTelephoneCI(tel: string): string | null {
  const morceaux = tel.split(/\s*[\/;,|]\s*|\s+et\s+/i).map((m) => m.replace(/\D/g, '').replace(/^00225|^225/, '')).filter((m) => m.length === 10);
  return morceaux.length ? morceaux.map((m) => m.replace(/(\d{2})(?=\d)/g, '$1 ').trim()).join(' / ') : null;
}
function normaliserSexe(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (/^(m|masculin|garçon|garcon|homme|male)$/.test(s)) return 'M';
  if (/^(f|féminin|feminin|fille|femme|female)$/.test(s)) return 'F';
  return null;
}
function normaliser(schema: ChampSchema[], brut: Resultat): Resultat {
  const res: Resultat = {};
  for (const c of schema) {
    const r = brut?.[c.name] || { valeur: null, confiance: 'faible' };
    let valeur: string | null = r.valeur == null ? null : String(r.valeur).trim().slice(0, 200) || null;
    let confiance = ['élevé', 'moyen', 'faible'].includes(r.confiance) ? r.confiance : 'moyen';
    if (valeur) {
      if (c.type === 'date') valeur = normaliserDate(valeur);
      else if (c.type === 'tel') valeur = normaliserTelephoneCI(valeur);
      else if (c.name === 'sexe') valeur = normaliserSexe(valeur);
      else if (c.name === 'nom') valeur = valeur.toUpperCase();
      else if (c.name === 'prenom') valeur = valeur.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (x) => x.toUpperCase());
      else if (c.type === 'email' || c.name === 'email') valeur = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur) ? valeur.toLowerCase() : null;
    }
    if (!valeur) confiance = 'faible';
    res[c.name] = { valeur, confiance };
  }
  return res;
}

// ---------- Groq (gratuit) ----------
// Le catalogue de Groq change souvent : on demande la liste des modèles
// disponibles et on choisit soi-même (vision pour les photos, grand modèle
// pour le texte), les noms connus restant prioritaires s'ils existent.
let catalogueGroq: string[] | null = null;
async function modelesDisponibles(cle: string): Promise<string[]> {
  if (catalogueGroq) return catalogueGroq;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${cle}` } });
    const d = await r.json();
    catalogueGroq = (d?.data || []).filter((m: { active?: boolean }) => m.active !== false).map((m: { id: string }) => m.id);
  } catch { catalogueGroq = []; }
  return catalogueGroq!;
}
async function choisirModeles(cle: string, preferes: string[], vision: boolean): Promise<string[]> {
  const dispo = await modelesDisponibles(cle);
  if (!dispo.length) return preferes;
  const ok = preferes.filter((m) => dispo.includes(m));
  const exclus = /whisper|guard|tts|playai|orpheus|distil|prompt-guard|compound/i;
  const candidats = dispo.filter((m) => !exclus.test(m) && !ok.includes(m));
  const extra = vision
    ? candidats.filter((m) => /llama-4|vision|scout|maverick|qwen.*vl|gemma-3/i.test(m))
    : candidats.filter((m) => /70b|120b|llama-4|maverick|scout|qwen|kimi|gpt-oss/i.test(m));
  return [...ok, ...extra].slice(0, 4);
}
async function groqChat(modelesPreferes: string[], messages: unknown[], vision = false): Promise<Resultat> {
  const cle = Deno.env.get('GROQ_API_KEY');
  if (!cle) throw new Error('GROQ_API_KEY absente');
  const modeles = await choisirModeles(cle, modelesPreferes, vision);
  if (!modeles.length) throw new Error(vision ? 'aucun modèle Groq capable de lire une image' : 'aucun modèle Groq disponible');
  let derniere = '';
  for (const modele of modeles) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modele, temperature: 0, max_tokens: 1200, response_format: { type: 'json_object' }, messages }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const texte = data?.choices?.[0]?.message?.content || '{}';
      try { return JSON.parse(texte); } catch { derniere = 'réponse illisible'; continue; }
    }
    derniere = `${modele} → ${resp.status} ${(await resp.text().catch(() => '')).slice(0, 120)}`;
  }
  throw new Error('Groq : ' + derniere);
}
async function transcrireAudio(fichierBase64: string, mimeType: string): Promise<string> {
  const cle = Deno.env.get('GROQ_API_KEY');
  if (!cle) throw new Error('Transcription audio indisponible (clé non configurée)');
  const octets = Uint8Array.from(atob(fichierBase64), (c) => c.charCodeAt(0));
  const ext = /ogg|opus/.test(mimeType) ? 'ogg' : /webm/.test(mimeType) ? 'webm' : /wav/.test(mimeType) ? 'wav' : /mp4|m4a|aac/.test(mimeType) ? 'm4a' : 'mp3';
  for (const modele of ['whisper-large-v3-turbo', 'whisper-large-v3']) {
    const fd = new FormData();
    fd.append('file', new Blob([octets], { type: mimeType }), `audio.${ext}`);
    fd.append('model', modele);
    fd.append('language', 'fr');
    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${cle}` }, body: fd });
    if (resp.ok) {
      const data = await resp.json();
      if (!data.text || !data.text.trim()) throw new Error('Aucune parole détectée dans cet enregistrement.');
      return data.text.trim();
    }
  }
  throw new Error('Transcription audio impossible : enregistrez de nouveau, plus près du micro, dans un endroit calme.');
}

// ---------- Anthropic (secours facultatif) ----------
async function claudeSecours(schema: ChampSchema[], contenu: unknown[]): Promise<Resultat> {
  const cle = Deno.env.get('ANTHROPIC_API_KEY');
  if (!cle) throw new Error('aucun secours configuré');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 1200, system: CONSIGNE + '\nChamps :\n' + descriptionChamps(schema), messages: [{ role: 'user', content: contenu }] }),
  });
  if (!resp.ok) throw new Error(`secours ${resp.status}`);
  const data = await resp.json();
  const texte = (data.content || []).map((b: { text?: string }) => b.text || '').join('');
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('secours : réponse illisible');
  return JSON.parse(m[0]);
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
    const { data: profil } = await appelant.from('profiles').select('role, ecole_id').eq('id', user.id).single();
    if (!profil?.ecole_id || !['secretariat', 'direction', 'fondation'].includes(profil.role)) throw new Error('Réservé au personnel administratif');

    const { formulaire, schema, typeSource, fichierBase64, fichiersBase64, mimeType, texte } = await req.json();
    if (!formulaire || !Array.isArray(schema) || !schema.length || schema.length > 20) throw new Error('Paramètres manquants');
    if (!['photo', 'audio', 'texte'].includes(typeSource)) throw new Error('Type de source invalide');
    const photos: string[] = (Array.isArray(fichiersBase64) ? fichiersBase64 : fichierBase64 ? [fichierBase64] : []).slice(0, 2);
    if (typeSource === 'photo' && (!photos.length || photos.some((p) => typeof p !== 'string' || p.length > 5_500_000))) throw new Error('Photo absente ou trop lourde (4 Mo maximum).');
    if (typeSource === 'audio' && (typeof fichierBase64 !== 'string' || fichierBase64.length > 11_000_000)) throw new Error('Enregistrement absent ou trop long (2 minutes maximum).');
    if (typeSource === 'texte' && (typeof texte !== 'string' || texte.trim().length < 5 || texte.length > 4000)) throw new Error('Collez un texte de 5 à 4000 caractères.');

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ecole } = await admin.from('ecoles').select('limite_remplissage_mensuelle').eq('id', profil.ecole_id).single();
    const limite = ecole?.limite_remplissage_mensuelle ?? 100;
    const debutMois = new Date(); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from('usage_remplissage_intelligent').select('id', { count: 'exact', head: true })
      .eq('ecole_id', profil.ecole_id).gte('created_at', debutMois.toISOString());
    if ((count ?? 0) >= limite) throw new Error(`Limite mensuelle de remplissages automatiques atteinte (${limite}). Contactez EcoMaZ pour l'augmenter.`);

    const consigne = CONSIGNE + `\nFormulaire « ${formulaire} ». Champs à remplir (clés JSON exactes) :\n` + descriptionChamps(schema);
    let brut: Resultat; let source = ''; let motifSecours = '';
    let contenuSecours: unknown[] = [];
    if (typeSource === 'photo') {
      const mt = mimeType || 'image/jpeg';
      contenuSecours = [{ type: 'text', text: 'Extrais les champs de ce document.' }, ...photos.map((p) => ({ type: 'image', source: { type: 'base64', media_type: mt, data: p } }))];
      try {
        brut = await groqChat(MODELES_VISION, [{ role: 'system', content: consigne },
          { role: 'user', content: [{ type: 'text', text: `Voici ${photos.length > 1 ? 'les photos (recto et verso) du' : 'la photo du'} document. Extrais les champs.` },
            ...photos.map((p) => ({ type: 'image_url', image_url: { url: `data:${mt};base64,${p}` } }))] }], true);
        source = 'groq';
      } catch (e) { motifSecours = (e as Error).message.slice(0, 200); brut = await claudeSecours(schema, contenuSecours).catch(() => { throw new Error('Analyse impossible pour le moment (' + (e as Error).message.slice(0, 80) + '). Réessayez dans un instant.'); }); source = 'secours'; }
    } else {
      const contenuTexte = typeSource === 'audio' ? await transcrireAudio(fichierBase64, mimeType || 'audio/webm') : String(texte).trim();
      contenuSecours = [{ type: 'text', text: `Texte :\n"""${contenuTexte}"""` }];
      try {
        brut = await groqChat(MODELES_TEXTE, [{ role: 'system', content: consigne }, { role: 'user', content: `Texte à analyser :\n"""${contenuTexte}"""` }]);
        source = 'groq';
      } catch (e) { motifSecours = (e as Error).message.slice(0, 200); brut = await claudeSecours(schema, contenuSecours).catch(() => { throw new Error('Analyse impossible pour le moment (' + (e as Error).message.slice(0, 80) + '). Réessayez dans un instant.'); }); source = 'secours'; }
    }

    const resultat = normaliser(schema as ChampSchema[], brut);
    await admin.from('usage_remplissage_intelligent').insert({ ecole_id: profil.ecole_id, utilisateur_id: user.id, formulaire, type_source: typeSource });
    return json({ ok: true, resultat, moteur: source, ...(motifSecours ? { motifSecours } : {}) });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});
