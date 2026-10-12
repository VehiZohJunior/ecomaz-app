// =====================================================================
// EcoMaZ — Envoi des notifications push (module commun aux fonctions)
// =====================================================================
// Bibliothèque gratuite « web-push » ; clés VAPID dans les secrets
// Supabase (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT), jamais
// dans le code. Les abonnements des téléphones sont dans push_abonnements
// (schema.sql section 52). Un abonnement expiré (téléphone désinstallé,
// notifications coupées) est supprimé automatiquement.
// =====================================================================

import webpush from 'npm:web-push@3.6.7';
// deno-lint-ignore no-explicit-any
type Client = any;

let pret = false;
function preparer(): boolean {
  if (pret) return true;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return false;
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'https://vehizohjunior.github.io/ecomaz-app/', pub, priv);
  pret = true;
  return true;
}

// Comptes parents reliés à au moins un de ces élèves (dans cette école)
export async function parentsDesEleves(admin: Client, ecoleId: string, eleveIds: string[]): Promise<string[]> {
  if (!eleveIds.length) return [];
  const ids = new Set<string>();
  for (let i = 0; i < eleveIds.length; i += 200) {
    const { data } = await admin.from('parents_eleves').select('parent_profile_id')
      .eq('ecole_id', ecoleId).in('eleve_id', eleveIds.slice(i, i + 200));
    (data || []).forEach((r: { parent_profile_id: string }) => ids.add(r.parent_profile_id));
  }
  return [...ids];
}

export interface MessagePush { title: string; body: string; url?: string; tag?: string }

// Envoie la notification à tous les téléphones abonnés de ces comptes.
export async function envoyerPush(admin: Client, userIds: string[], message: MessagePush): Promise<{ envoyes: number; echecs: number }> {
  if (!userIds.length || !preparer()) return { envoyes: 0, echecs: 0 };
  const { data: abonnements } = await admin.from('push_abonnements').select('id, endpoint, p256dh, auth').in('user_id', userIds);
  let envoyes = 0, echecs = 0;
  const contenu = JSON.stringify(message);
  await Promise.all((abonnements || []).map(async (a: { id: string; endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, contenu, { TTL: 3600, urgency: 'high' });
      envoyes++;
    } catch (e) {
      echecs++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_abonnements').delete().eq('id', a.id);
    }
  }));
  return { envoyes, echecs };
}
