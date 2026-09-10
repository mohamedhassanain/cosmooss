#!/usr/bin/env node
/**
 * Vérification POST-DÉPLOIEMENT (Vercel + Cloudflare + Supabase + SEO).
 *
 * Contrôle une URL publique et rapporte PASS/FAIL pour chaque point. Ne
 * modifie rien : uniquement des requêtes GET en lecture.
 *
 * Usage :
 *   node scripts/verify-deployment.mjs https://cosmooss.vercel.app
 *   node scripts/verify-deployment.mjs https://cosmooss.com
 *   node scripts/verify-deployment.mjs https://cosmooss.com --slug mon-produit
 *   node scripts/verify-deployment.mjs https://cosmooss.com --supabase https://xxxx.supabase.co
 *
 * Sortie : code 0 si tous les contrôles CRITIQUES passent, 1 sinon.
 * Les contrôles « info » (cf-cache-status, Supabase, aperçu bot) n'échouent
 * jamais le script — ils informent seulement (le CDN/Supabase peuvent être
 * testés séparément).
 */

const args = process.argv.slice(2);
const baseUrlArg = args.find((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!baseUrlArg) {
  console.error('❌ Usage : node scripts/verify-deployment.mjs <baseUrl> [--slug <slug>] [--supabase <url>]');
  process.exit(2);
}

const BASE = baseUrlArg.replace(/\/+$/, '');
const FIXED_SLUG = flag('--slug');
const SUPABASE_URL = flag('--supabase');

// User-Agent « robot d'aperçu social » : doit recevoir le HTML prérendu
// (og:title/og:image) sur /produit/<slug>, sans exécuter de JavaScript.
const BOT_UA = 'WhatsApp/2.23';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const results = { critical: 0, criticalFail: 0, info: 0 };
const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

function pass(label, extra = '') {
  results.critical += 1;
  console.log(`${GREEN}✓${RESET} ${label}${extra ? ` ${DIM}${extra}${RESET}` : ''}`);
}
function fail(label, extra = '') {
  results.critical += 1;
  results.criticalFail += 1;
  console.log(`${RED}✗ ${label}${RESET}${extra ? ` ${DIM}${extra}${RESET}` : ''}`);
}
function info(label, extra = '') {
  results.info += 1;
  console.log(`${YELLOW}•${RESET} ${label}${extra ? ` ${DIM}${extra}${RESET}` : ''}`);
}
function section(title) {
  console.log(`\n${DIM}── ${title} ${'─'.repeat(Math.max(0, 46 - title.length))}${RESET}`);
}

async function get(path, { ua = BROWSER_UA, raw = false } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, { headers: { 'user-agent': ua }, redirect: 'manual' });
  const body = raw ? '' : await res.text().catch(() => '');
  return { res, body, url };
}

function header(res, name) {
  return res.headers.get(name.toLowerCase()) ?? '';
}

async function main() {
  console.log(`\n🔎 Vérification du déploiement : ${BASE}\n`);

  // ── 1. HTML racine + SEO par défaut ────────────────────────────────
  section('HTML racine & SEO');
  try {
    const { res, body } = await get('/');
    if (res.status === 200) pass('GET / → 200'); else fail('GET / → 200', `reçu ${res.status}`);

    const title = (body.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    if (/cosmooss/i.test(title)) pass('Balise <title> présente', title.trim().slice(0, 60));
    else fail('Balise <title> avec « Cosmooss »', `trouvé: ${title.slice(0, 60) || '(vide)'}`);

    const hasOgTitle = /<meta[^>]+property=["']og:title["']/i.test(body);
    hasOgTitle ? pass('meta og:title présent') : fail('meta og:title présent');

    const hasOgImage = /<meta[^>]+property=["']og:image["']/i.test(body);
    hasOgImage ? pass('meta og:image présent (aperçu social)') : fail('meta og:image présent (aperçu social)');

    const hasTwitter = /<meta[^>]+name=["']twitter:card["']/i.test(body);
    hasTwitter ? pass('meta twitter:card présent') : fail('meta twitter:card présent');

    const hasRoot = /<div id="root">/i.test(body);
    hasRoot ? pass('Point de montage SPA (#root) présent') : fail('Point de montage SPA (#root) présent');
  } catch (e) {
    fail('GET / (réseau)', e.message);
  }

  // ── 2. En-têtes de sécurité (posés par vercel.json) ────────────────
  section('En-têtes de sécurité (vercel.json)');
  try {
    const { res } = await get('/');
    for (const [name, expected] of [
      ['x-content-type-options', 'nosniff'],
      ['x-frame-options', 'SAMEORIGIN'],
      ['referrer-policy', 'strict-origin-when-cross-origin'],
    ]) {
      const v = header(res, name);
      if (v && v.includes(expected)) pass(`${name}: ${v}`);
      else fail(`${name}`, `attendu « ${expected} », reçu « ${v || '(absent)'} »`);
    }
    const pp = header(res, 'permissions-policy');
    pp ? pass(`permissions-policy présent`, pp) : fail('permissions-policy présent');
  } catch (e) {
    fail('GET / en-têtes (réseau)', e.message);
  }

  // ── 3. robots.txt + sitemap.xml ────────────────────────────────────
  section('robots.txt & sitemap.xml');
  let productSlugs = [];
  try {
    const { res, body } = await get('/robots.txt');
    if (res.status === 200) {
      pass('GET /robots.txt → 200');
      if (/Sitemap:\s*https?:\/\//i.test(body)) pass('robots.txt déclare un Sitemap absolu');
      else fail('robots.txt déclare un Sitemap absolu');
      if (/Disallow:\s*\/admin/i.test(body)) pass('robots.txt bloque /admin');
      else fail('robots.txt bloque /admin');
    } else fail('GET /robots.txt → 200', `reçu ${res.status}`);
  } catch (e) {
    fail('GET /robots.txt (réseau)', e.message);
  }

  try {
    const { res, body } = await get('/sitemap.xml');
    if (res.status === 200) {
      pass('GET /sitemap.xml → 200');
      if (/^<\?xml/i.test(body.trim())) pass('sitemap.xml est un XML valide (en-tête)');
      else fail('sitemap.xml est un XML valide (en-tête)');
      const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      if (locs.length > 0) pass(`sitemap.xml contient ${locs.length} URL(s)`);
      else fail('sitemap.xml contient au moins une URL');
      productSlugs = locs
        .filter((l) => /\/produit\//.test(l))
        .map((l) => decodeURIComponent(l.split('/produit/')[1] || '').replace(/\/$/, ''))
        .filter(Boolean);
      if (productSlugs.length === 0) {
        info('Aucun produit actif dans le sitemap', '→ ajouter des produits avant le lancement public');
      }
    } else fail('GET /sitemap.xml → 200', `reçu ${res.status}`);
  } catch (e) {
    fail('GET /sitemap.xml (réseau)', e.message);
  }

  // ── 4. Assets immuables (cache navigateur / CDN) ───────────────────
  section('Cache des assets');
  try {
    const { body } = await get('/');
    const assetMatch = body.match(/\/assets\/[^"'()]+\.(?:js|css)/);
    if (!assetMatch) {
      fail('Un asset /assets/*.js est référencé dans le HTML');
    } else {
      const assetPath = assetMatch[0];
      const { res } = await get(assetPath);
      if (res.status === 200) pass(`GET ${assetPath} → 200`);
      else fail(`GET ${assetPath} → 200`, `reçu ${res.status}`);
      const cc = header(res, 'cache-control');
      if (/immutable/i.test(cc) && /max-age=\d{6,}/i.test(cc)) pass(`Cache-Control immutable`, cc);
      else fail('Cache-Control immutable sur /assets/*', `reçu « ${cc || '(absent)'} »`);
      const cf = header(res, 'cf-cache-status');
      if (cf) info(`cf-cache-status: ${cf}`, '(Cloudflare actif)');
      else info('Pas de cf-cache-status', '(normal tant que le domaine n\'est pas derrière Cloudflare)');
    }
  } catch (e) {
    fail('Vérification des assets (réseau)', e.message);
  }

  // ── 5. Fallback SPA (routes client) ────────────────────────────────
  section('Fallback SPA (React Router)');
  for (const route of ['/produits', '/contact']) {
    try {
      const { res, body } = await get(route);
      const ok = res.status === 200 && /<div id="root">/i.test(body);
      ok ? pass(`GET ${route} → SPA (200 + #root)`) : fail(`GET ${route} → SPA`, `status ${res.status}`);
    } catch (e) {
      fail(`GET ${route} (réseau)`, e.message);
    }
  }

  // ── 6. Aperçu bot sur une fiche produit (prérendu SEO) ─────────────
  section('Aperçu bot / produit prérendu');
  const slug = FIXED_SLUG || productSlugs[0];
  if (!slug) {
    info('Aucun slug produit disponible — test aperçu bot ignoré');
  } else {
    try {
      const { res, body } = await get(`/produit/${encodeURIComponent(slug)}`, { ua: BOT_UA });
      if (res.status === 200) pass(`GET /produit/${slug} (UA robot) → 200`);
      else fail(`GET /produit/${slug} (UA robot) → 200`, `reçu ${res.status}`);
      const hasOg = /<meta[^>]+property=["']og:title["']/i.test(body);
      hasOg ? pass('Le HTML prérendu expose og:title aux robots') : fail('Le HTML prérendu expose og:title aux robots');
      const hasJsonLd = /application\/ld\+json/i.test(body);
      hasJsonLd ? pass('JSON-LD (Product) présent dans le HTML prérendu') : fail('JSON-LD (Product) présent');
      const loops = /http-equiv=["']refresh["']/i.test(body);
      loops ? fail('Pas de meta refresh auto-référent (boucle robots)') : pass('Pas de meta refresh auto-référent (boucle robots)');
    } catch (e) {
      fail(`GET /produit/${slug} (réseau)`, e.message);
    }
  }

  // ── 7. Supabase joignable (info) ───────────────────────────────────
  if (SUPABASE_URL) {
    section('Supabase');
    try {
      const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/health`);
      if (res.ok) info(`Supabase ${SUPABASE_URL} → ${res.status} (joignable)`);
      else info(`Supabase ${SUPABASE_URL} → ${res.status}`);
    } catch (e) {
      info(`Supabase injoignable`, e.message);
    }
  }

  // ── Résumé ─────────────────────────────────────────────────────────
  const ok = results.criticalFail === 0;
  console.log(
    `\n${ok ? GREEN + '✅ TOUS LES CONTRÔLES CRITIQUES PASSENT' : RED + '❌ ÉCHECS CRITIQUES'}${RESET} ` +
      `(${results.critical - results.criticalFail}/${results.critical} critiques, ${results.info} info)\n`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('❌ Erreur inattendue :', e);
  process.exit(1);
});
