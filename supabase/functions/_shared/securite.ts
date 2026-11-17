// =====================================================================
// EcoMaZ — Sécurité commune des fonctions Edge (audit du 2026-11-17)
// =====================================================================
// - CORS : seule l'application (GitHub Pages) peut appeler les fonctions
//   depuis un navigateur. Les appels serveur à serveur (webhook PayDunya,
//   tâche planifiée) ne sont pas concernés par le CORS.
// - Entêtes de sécurité sur chaque réponse.
// - Messages d'erreur : le détail technique (base de données, moteur
//   d'IA…) n'est jamais renvoyé au navigateur.
// - Limitation des appels répétés par utilisateur (table limites_appels,
//   schema.sql section 121, lisible par le seul service).
// =====================================================================

export const ORIGINE_APPLI = 'https://vehizohjunior.github.io';

export const ENTETES_SECURITE: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Vary': 'Origin',
};

// Un message rédigé par nous (en français, pour l'utilisateur) passe ; un détail technique est masqué.
const TECHNIQUE = /relation|column|violates|constraint|syntax|duplicate key|permission denied|jwt|pgrst|row-level|policy|function .*does not exist|null value|invalid input|uuid|sqlstate|groq|anthropic|api\.|fetch failed|ECONN|timeout|deno|stack|undefined|TypeError|ReferenceError|Cannot read/i;
export function messagePublic(e: unknown): string {
  const m = String((e as Error)?.message ?? e ?? '').trim();
  if (!m || TECHNIQUE.test(m) || m.length > 300) return 'Une erreur est survenue. Réessayez dans un instant ; si cela continue, prévenez l’école.';
  return m;
}

// Au plus `max` appels de cette action par cet utilisateur pendant `minutes` minutes.
// deno-lint-ignore no-explicit-any
export async function limiter(admin: any, userId: string, action: string, max: number, minutes: number): Promise<void> {
  const depuis = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count, error } = await admin.from('limites_appels').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('action', action).gte('created_at', depuis);
  if (error) return; // la limitation ne doit jamais bloquer le service si la table est indisponible
  if ((count ?? 0) >= max) throw new Error(`Trop de demandes en peu de temps. Réessayez dans ${minutes >= 60 ? Math.round(minutes / 60) + ' heure(s)' : minutes + ' minutes'}.`);
  await admin.from('limites_appels').insert({ user_id: userId, action });
  // Ménage : les traces de plus d'un jour de cet utilisateur
  if (Math.random() < 0.05) await admin.from('limites_appels').delete().eq('user_id', userId).lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
}
