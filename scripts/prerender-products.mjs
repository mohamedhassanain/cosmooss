#!/usr/bin/env node
/**
 * Prerendering statique SEO + sitemap.xml + robots.txt (production, build-time).
 *
 * Architecture cible : Cloudflare → Docker → Nginx → React/Vite → Supabase.
 * Ce script tourne PENDANT le build Docker (pas de runtime, pas de serveur,
 * aucune requête supplémentaire pour les visiteurs) :
 *
 *   1. Fiches produit : un HTML statique PAR PRODUIT ACTIF dans
 *      dist/prerendered/produit/<slug>/index.html. L'hébergeur (Vercel via
 *      vercel.json, ou Nginx) le sert aux robots d'aperçu social
 *      (facebookexternalhit, Twitterbot, WhatsApp…) sur /produit/<slug>.
 *      AUCUNE redirection meta refresh : les navigateurs ne reçoivent jamais ce
 *      fichier (la réécriture ne cible que les User-Agents robots), et une
 *      redirection vers la même URL ferait boucler les crawlers.
 *   2. sitemap.xml : URLs canoniques publiques (accueil, /produits, /contact,
 *      catégories, produits actifs) — jamais /admin, /auth, /checkout, ni
 *      URLs de filtres (recherche/tri/promo/pagination).
 *   3. robots.txt : généré dans dist/ avec SITE_ORIGIN — remplace le
 *      placeholder public/robots.txt à la volée (aucun domaine en dur).
 *
 * Usage (cf. .env.example + Dockerfile) :
 *   VITE_SUPABASE_URL=https://xxx.supabase.co \
 *   VITE_SUPABASE_PUBLISHABLE_KEY=yyy \
 *   SITE_ORIGIN=https://domaine-final.com \
 *   npm run prerender
 *
 * SITE_ORIGIN : à défaut, ce script retombe sur l'origine de production
 * documentée (DEFAULT_SITE_ORIGIN) — le build ne casse jamais pour une variable
 * d'environnement manquante (déploiements Vercel, notamment les previews).
 */
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY sont requis.');
  process.exit(1);
}

/**
 * Origin de production, SDCF (single source of truth) pour sitemap,
 * canonicals et OG des pages prérendues.
 */
const DEFAULT_SITE_ORIGIN = 'https://cosmooss.com';

const rawOrigin = process.env.SITE_ORIGIN || '';
let ORIGIN = rawOrigin.replace(/\/+$/, '');
if (!ORIGIN) {
  // Ne PAS casser le build si la variable est absente : l'origine de production
  // documentée est la source unique de vérité SEO (sitemap, canonicals, OG).
  console.warn(
    `⚠️  SITE_ORIGIN absent — repli sur l'origine de production ${DEFAULT_SITE_ORIGIN}. ` +
      "Définir SITE_ORIGIN dans l'environnement pour des URLs canoniques explicites."
  );
  ORIGIN = DEFAULT_SITE_ORIGIN;
}

const SITE_NAME = 'Cosmooss';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Champs publics nécessaires au SEO des fiches prérendues (jointure catégorie incluse). */
const PRODUCT_SELECT = `
  id, name, slug, description, price, image_url, brand,
  stock_quantity, updated_at, is_active,
  categories(name, slug)
`;

// NB : les entités HTML sont construites à partir de String.fromCharCode(38) ('&')
// pour que le fichier source ne contienne jamais le caractère '&' littéral.
function escapeHtml(value) {
  const amp = `${String.fromCharCode(38)}amp;`;
  const lt = `${String.fromCharCode(38)}lt;`;
  const gt = `${String.fromCharCode(38)}gt;`;
  const quot = `${String.fromCharCode(38)}quot;`;
  const apos = `${String.fromCharCode(38)}#39;`;
  return String(value ?? '')
    .replaceAll('&', amp)
    .replaceAll('<', lt)
    .replaceAll('>', gt)
    .replaceAll('"', quot)
    .replaceAll("'", apos);
}

function escapeXml(value) {
  return escapeHtml(value);
}

function firstImage(imageUrl) {
  if (!imageUrl) return null;
  try {
    const parsed = JSON.parse(imageUrl);
    if (Array.isArray(parsed)) return parsed[0] || null;
    return imageUrl;
  } catch {
    return imageUrl;
  }
}

/** Meta description : description RÉELLE du produit, jamais de texte inventé. */
function productDescription(product) {
  return (product.description || '').trim().slice(0, 200) || null;
}

/**
 * JSON-LD Product — PARITÉ stricte avec React (src/pages/shop/ProduitDetail.tsx).
 * Uniquement des données réelles : jamais de sku/reviews/ratings/brand/adresse
 * inventés. offers n'est posé que si le prix est un nombre valide ; availability
 * dépend réellement de stock_quantity.
 */
function productJsonLd(product) {
  const image = firstImage(product.image_url || null);
  const description = productDescription(product);
  const price = Number(product.price);

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
  };

  if (Number.isFinite(price) && price >= 0) {
    data.offers = {
      '@type': 'Offer',
      price,
      priceCurrency: 'MAD',
      ...(product.stock_quantity > 0
        ? { availability: 'https://schema.org/InStock' }
        : { availability: 'https://schema.org/OutOfStock' }),
    };
  }

  return data;
}

/**
 * JSON-LD BreadcrumbList — seulement si une catégorie réelle existe
 * (parité avec React : Absence de catégorie → pas de breadcrumb JSON-LD).
 */
function breadcrumbJsonLd(product) {
  if (!product.categories?.name || !product.categories?.slug) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${ORIGIN}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: product.categories.name,
        item: `${ORIGIN}/produits?categorie=${encodeURIComponent(product.categories.slug)}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: product.name,
        item: `${ORIGIN}/produit/${encodeURIComponent(product.slug)}`,
      },
    ],
  };
}

/**
 * HTML statique d'une fiche produit. Titre et og:title correspondent au React
 * (« Acheter {name} au Maroc | {site} ») — pas de divergence entre la fiche
 * prérendue et la fiche hydratée.
 */
function buildProductHtml(product) {
  const slug = product.slug;
  const url = `${ORIGIN}/produit/${encodeURIComponent(slug)}`;
  const image = firstImage(product.image_url || null);
  const description = productDescription(product);
  const title = `Acheter ${product.name} au Maroc`;
  const fullTitle = `${title} | ${SITE_NAME}`;

  const jsonLdBlocks = [productJsonLd(product)];
  const breadcrumb = breadcrumbJsonLd(product);
  if (breadcrumb) jsonLdBlocks.push(breadcrumb);

  const noindex = !product.is_active
    ? '<meta name="robots" content="noindex, nofollow" />'
    : '';

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(fullTitle)}</title>
    ${noindex}
    ${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ''}

    <!-- Canonical + OG : SITE_ORIGIN centralisé (même stratégie que React) -->
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta property="og:type" content="product" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:title" content="${escapeHtml(fullTitle)}" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    ${description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : ''}
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}

    <!-- Twitter Card (aucun compte social vérifié → pas de twitter:site inventé) -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(fullTitle)}" />
    ${description ? `<meta name="twitter:description" content="${escapeHtml(description)}" />` : ''}
    ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}

    ${jsonLdBlocks
      .map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
      .join('\n    ')}

    <!-- PAS de <meta http-equiv="refresh"> ici : les navigateurs ne reçoivent
         JAMAIS cette page (la réécriture Vercel ne cible que les User-Agents de
         robots d'aperçu social). Rediriger vers la même URL ferait boucler les
         crawlers qui suivent le meta refresh (Googlebot/Bingbot) → page non
         indexable (boucle de redirection). -->
  </head>
  <body style="margin:0;font-family:system-ui,sans-serif;background:#fef8fa;color:#5b2333;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;">
    <div>
      <h1 style="font-size:1.25rem;margin-bottom:0.5rem;">${escapeHtml(product.name)}</h1>
      ${product.brand ? `<p style="margin:0.25rem 0;color:#9d6b7a;font-size:0.9rem;">${escapeHtml(product.brand)}</p>` : ''}
      ${product.price != null ? `<p style="color:#9d6b7a;">${escapeHtml(Number(product.price).toLocaleString('fr-FR'))} DH</p>` : ''}
      ${description ? `<p style="max-width:38rem;margin:0.75rem auto 0;color:#5b2333;font-size:0.9rem;">${escapeHtml(description)}</p>` : ''}
      <a href="${escapeHtml(url)}" style="display:inline-block;margin-top:1rem;background:#f0a0b8;color:#fff;padding:0.75rem 1.5rem;border-radius:9999px;text-decoration:none;font-weight:bold;">Voir le produit</a>
    </div>
  </body>
</html>
`;
}

/**
 * Sitemap.xml — URLs publiques indexables UNIQUEMENT :
 *   * accueil, catalogue, contact
 *   * catégories (aucun champ is_active en base → toutes les catégories)
 *   * produits actifs
 * JAMais : admin, auth, checkout, account, 404, recherche/tri/promo/pagination.
 * lastmod : updated_at réel du produit (ou date de génération pour les fixes).
 */
function buildSitemap({ categories, products, generatedAt }) {
  const urls = [
    { loc: `${ORIGIN}/`, lastmod: generatedAt, priority: '1.0' },
    { loc: `${ORIGIN}/produits`, lastmod: generatedAt, priority: '0.9' },
    { loc: `${ORIGIN}/contact`, lastmod: generatedAt, priority: '0.5' },
  ];

  for (const category of categories || []) {
    urls.push({
      loc: `${ORIGIN}/produits?categorie=${encodeURIComponent(category.slug)}`,
      lastmod: category.updated_at || generatedAt,
      priority: '0.8',
    });
  }

  for (const product of products || []) {
    urls.push({
      loc: `${ORIGIN}/produit/${encodeURIComponent(product.slug)}`,
      lastmod: product.updated_at || generatedAt,
      priority: '0.7',
    });
  }

  const entries = urls
    .map(
      (u) => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n` +
        `    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/**
 * robots.txt généré avec SITE_ORIGIN — le fichier public/robots.txt reste le
 * template de développement (placeholder), la production utilise celui-ci.
 * Bloque uniquement les zones privées ; CSS/JS/images/produits/catégories
 * publics restent crawlables.
 */
function buildRobotsTxt() {
  return [
    `# Cosmooss — robots.txt (généré par npm run prerender)`,
    `# Origin configurée via SITE_ORIGIN : ${ORIGIN}`,
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /auth',
    'Disallow: /auth/',
    'Disallow: /acces-refuse',
    'Disallow: /checkout',
    'Disallow: /account',
    '',
    `Sitemap: ${ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');
}

async function main() {
  console.log('🔎 Récupération des produits et catégories publics…');
  const [productsRes, categoriesRes] = await Promise.all([
    supabase.from('products').select(PRODUCT_SELECT).eq('is_active', true),
    // PAS de filtre is_active : le schéma (supabase/database.sql) n'a aucun
    // champ actif/inactif sur categories. On n'invente pas de colonne.
    supabase.from('categories').select('id, slug, updated_at').order('sort_order', { ascending: true }),
  ]);

  if (productsRes.error) {
    console.error('❌ Erreur Supabase (products) :', productsRes.error.message);
    process.exit(1);
  }
  if (categoriesRes.error) {
    console.error('❌ Erreur Supabase (categories) :', categoriesRes.error.message);
    process.exit(1);
  }

  const products = productsRes.data || [];
  const categories = categoriesRes.data || [];
  const generatedAt = new Date().toISOString();

  const outputRoot = path.resolve('dist');
  let count = 0;

  // 1. Fiches produit prérendues
  for (const product of products) {
    const dir = path.join(outputRoot, 'prerendered', 'produit', product.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), buildProductHtml(product), 'utf8');
    count += 1;
  }

  // 2. Sitemap.xml (racine dist → servi par Nginx à /sitemap.xml)
  await writeFile(
    path.join(outputRoot, 'sitemap.xml'),
    buildSitemap({ categories, products, generatedAt }),
    'utf8'
  );

  // 3. robots.txt production (SITE_ORIGIN centralisée — aucun domaine en dur)
  await writeFile(path.join(outputRoot, 'robots.txt'), buildRobotsTxt(), 'utf8');

  console.log(`✅ ${count} fiche(s) produit prérendue(s) dans dist/prerendered/produit/…`);
  console.log(`✅ sitemap.xml généré (${categories.length} catégories, ${products.length} produits).`);
  console.log(`✅ robots.txt généré (Sitemap: ${ORIGIN}/sitemap.xml).`);
  console.log('Docker + Nginx servent ces fichiers statiques aux robots (voir nginx/default.conf).');
}

main().catch((err) => {
  console.error('❌ Erreur inattendue :', err);
  process.exit(1);
});
