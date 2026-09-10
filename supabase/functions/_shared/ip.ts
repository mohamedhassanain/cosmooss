// =====================================================================
// Récupération de l'adresse IP cliente pour les Edge Functions.
// L'IP n'est JAMAIS fournie par le client : elle provient uniquement des
// en-têtes ajoutés par la plateforme Supabase. Ordre de confiance :
//   1. `cf-connecting-ip`  — posé par Cloudflare.
//   2. `x-forwarded-for`   — première entrée des proxies en amont.
//   3. `x-real-ip`         — posé par certains reverse-proxies.
// L'IP est HACHÉE (HMAC-SHA256, 128 bits) avant tout stockage.
// =====================================================================

export function getClientIp(req: Request): string | null {
  const candidates: string[] = [];
  const cf = req.headers.get("cf-connecting-ip");
  if (cf?.trim()) candidates.push(cf.trim());
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) candidates.push(first);
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) candidates.push(realIp.trim());

  for (const ip of candidates) {
    if (ip && ip !== "unknown" && !ip.startsWith("::ffff:")) return ip;
  }
  return null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashIp(ip: string, secret?: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  if (secret) {
    const keyData = new TextEncoder().encode(`cosmooss-rl:${secret}`);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
    return toHex(new Uint8Array(signature)).slice(0, 32);
  }
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest)).slice(0, 32);
}
