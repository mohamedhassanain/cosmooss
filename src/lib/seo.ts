/**
 * Utilitaires SEO — sans dépendance externe.
 *
 * Centralise la construction d'URLs absolues (canonical / og:url / og:image),
 * la gestion des balises meta, du rel=canonical, du robots meta et du JSON-LD.
 * Aucune donnée privée n'y transite : uniquement du public.
 *
 * SITE_ORIGIN centralisée :
 *   * Runtime navigateur → `window.location.origin` (le vrai domaine) — les
 *     canonicals/og:url sont donc TOUJOURS cohérents avec l'URL servie.
 *   * Environnements sans DOM (tests, outils de build) → `DEFAULT_SITE_ORIGIN`
 *     (origine de production, identique à .env.example).
 *   * Sitemap / robots.txt / fiches prérendues → `SITE_ORIGIN` de
 *     scripts/prerender-products.mjs (variable d'environnement au build).
 */

export const DEFAULT_SITE_NAME = 'Cosmooss';

/** Domaine de production (source unique de vérité SEO — voir .env.example). */
export const DEFAULT_SITE_ORIGIN = 'https://cosmooss.com';

/** Origin courante (au runtime → le domaine de production une fois déployé). */
export function getSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_SITE_ORIGIN;
}

/** Convertit un chemin (ou URL) en URL absolue sur l'origine courante. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = getSiteOrigin();
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${cleaned}`;
}

/** Image OG par défaut du site (absolue). */
export function getDefaultOgImage(): string {
  return absoluteUrl('/og-image.png');
}

/** Crée ou met à jour une balise meta. */
export function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Crée ou met à jour la balise <link rel="canonical"> (une seule par page). */
export function setCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

/** Contrôle d'indexation (noindex pour les pages non publiques / erreurs). */
export function setRobots(index: boolean): void {
  setMeta('name', 'robots', index ? 'index, follow' : 'noindex, nofollow');
}

/** Crée ou met à jour un bloc JSON-LD identifié (idempotent). */
export function upsertJsonLd(id: string, data: unknown): void {
  const scriptId = `jsonld-${id}`;
  let script = document.head.querySelector<HTMLScriptElement>(`script[data-seo-id="${scriptId}"]`);
  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-seo-id', scriptId);
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

/** Retire un bloc JSON-LD (quand la donnée disparaît). */
export function removeJsonLd(id: string): void {
  document.head
    .querySelectorAll<HTMLScriptElement>(`script[data-seo-id="jsonld-${id}"]`)
    .forEach((script) => script.remove());
}
