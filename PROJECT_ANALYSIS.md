# Analyse complète du projet — Kissariya Cosmétiques

> Analyse statique et dynamique (lecture du code + exécution réelle des outils)
> réalisée sur l'état actuel du dépôt `c:/Users/mohamed hassanain/Desktop/kissariya-main`.

---

## 1. Résumé exécutif

**Kissariya Cosmétiques** est une application e-commerce (cosmétiques naturels/bio au Maroc)
construite comme une **SPA React 18 + TypeScript** servie en statique, avec **Supabase** comme
backend unique (Auth, PostgreSQL + RLS, Storage, Edge Functions) et **Cloudflare + Docker/Nginx**
devant. Il n'y a **aucun serveur applicatif propre** : le navigateur parle directement à Supabase,
sauf pour les écritures publiques (commandes, contact) qui passent par des **Edge Functions
rate-limitées**.

Le projet est **mûrement optimisé** (perf, SEO, sécurité, scaling) et **bien structuré** (séparation
net services / hooks / pages / composants). Les vérifications donnent :

| Vérification | Résultat |
|---|---|
| `npx vitest run` | ✅ **99 tests / 13 fichiers — tous verts** |
| `npx eslint .` | ✅ **0 erreur, 0 warning** |
| `npm run build` (vite) | ✅ **OK — 2203 modules, 8.79 s** |
| `tsc --noEmit` | ⚠️ **8 erreurs de type** (couche services uniquement) |

Le principal point noir est le **type-check TypeScript qui échoue** (les 8 erreurs ne bloquent pas le
build car Vite transpile via SWC sans type-check, mais elles cassent une éventuelle CI `tsc`).

---

## 2. Stack technique

| Couche | Technologie | Version |
|---|---|---|
| UI | React + TypeScript | 18.3 / 5.8 |
| Build | Vite | 5.4 |
| Routing | React Router | v7 |
| État serveur | TanStack React Query | v5 |
| État client | Context API (Auth, Cart) | — |
| UI kit | shadcn/ui (Radix) + Tailwind | 3.4 |
| Icônes | Lucide React | 0.462 |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) | supabase-js 2.89 |
| Monitoring | Sentry | 10.x |
| Tests unitaires | Vitest + Testing Library | 4.x |
| Tests E2E | Playwright | 1.62 |
| Déploiement | Docker (node build + nginx runtime), Cloudflare | nginx 1.27-alpine |
| Package manager | bun (lockfile) / npm (Docker) | — |

---

## 3. Architecture

```
Visiteur → Cloudflare (CDN assets + WAF) → Docker/Nginx (SPA React statique)
                                                │
                                                ├─ Supabase REST/Auth/Storage (selon JWT → RLS)
                                                └─ Edge Functions create-order / create-contact
                                                   (service_role, rate-limitées, validées)
```

### 3.1 Frontend — séparation des responsabilités

Le code suit une architecture en couches **stricte et cohérente** :

- `src/services/*.service.ts` — **seule** couche qui touche Supabase. Aucune logique Supabase dans
  les composants. Chaque domaine a son fichier : `product`, `category`, `order`, `contact`,
  `promo`, `site-settings`, `storage`, `whatsapp`.
- `src/hooks/*` — adaptateurs React Query (cache, mutations optimistes, invalidation). Ex.
  `useProducts`, `useOrders`, `useCategories`, `useSiteSettings`, `useSeo`, `useImageUpload`,
  `useLoginBackoff`.
- `src/providers/*` — Auth (session + `is_admin()` via RPC), Cart (localStorage + sync multi-onglets),
  QueryClient.
- `src/pages/*` — 4 pages publiques (`Index`, `Produits`, `ProduitDetail`, `Contact`), 8 pages admin,
  auth, erreurs.
- `src/components/*` — `ui/` (shadcn), `layout/`, `product/`, `navigation/`, `cart/`, `shared/`.
- `src/lib/*` — utilitaires purs : `seo.ts`, `images.ts` (srcSet), `product-promo.ts`, `schemas.ts`
  (Zod), `utils.ts` (slugify, format WhatsApp).
- `src/types/*` — types du domaine (`product`, `order`, `category`, `site`).

**Code splitting** : toutes les pages sont `lazy()` sauf `Index` ; Vite découpe aussi les vendors
(`react-core`, `radix-ui`, `supabase`, `sentry`, `react-router`, `tanstack-query`).

### 3.2 Backend — Supabase

**Schéma (`supabase/database.sql`, idempotent, script unique) :**
- 8 tables : `categories`, `subcategories`, `products`, `product_images`, `orders`,
  `contact_messages`, `site_settings`, `promos` + 2 tables techniques (`rate_limit_counters`,
  `admin_users`).
- `products.search_vector` = colonne générée `tsvector` (français) + index GIN ; index trigram
  (`pg_trgm`) sur `name`/`brand` pour la recherche `ILIKE %…%` ; index de pagination et de filtres.
- Contraintes d'intégrité sur `orders` (quantité ≥ 1, prix ≥ 0, nom non vide).
- Triggers `updated_at` sur les tables concernées.
- Bucket Storage `cosmetics-images` (lecture publique).

**Edge Functions (`supabase/functions/`) :**
- `create-order` et `create-contact` : unique chemin d'écriture publique. Chacune fait
  CORS + vérification d'origine, récupère l'IP depuis les en-têtes plateforme, la **hache
  (HMAC-SHA256)**, applique le **rate limiting persistant**, **valide** le payload, puis insère via
  `service_role`.
- Modules `_shared/` : `validation.ts` (pure, testée unitairement), `rate-limit.ts` (fenêtres 10 min
  + 1 h, anti-spam 5 s, nettoyage probabiliste), `ip.ts`, `cors.ts`, `config.ts`, `env.ts`,
  `supabase-admin.ts` (client PostgREST minimal, sans supabase-js).
- **Anti-fraude** : pour une commande référençant un `product_id`, le **prix est recalculé côté
  serveur** depuis le catalogue ; le `total_price` client est ignoré. Le `status` client est forcé à
  `pending`.

### 3.3 Déploiement

- `Dockerfile` multi-étapes : `node:22-alpine` → `npm ci` + `vite build` + `prerender` →
  `nginx:1.27-alpine` (copie `dist/`). Échoue si `VITE_SUPABASE_URL`/`KEY` ou `SITE_ORIGIN`
  manquent (`RUN_PRERENDER=true`).
- `docker-compose.yml` : un service `web` (8080:80), build args VITE_* publics.
- `docker-compose.scale.yml` : 3 réplicas interchangeables + healthcheck `/health`.
- `nginx/default.conf` : détection bots par User-Agent (map) → sert le HTML prérendu aux robots,
  SPA fallback pour les navigateurs, gzip, cache immutable `/assets/` 1 an, `index.html`
  `no-cache`, headers de sécurité, `/health`, refus des dotfiles.
- CI : `.github/workflows/playwright.yml` (Playwright E2E uniquement). **Pas de CI** pour
  Vitest / lint / tsc / build.
- Fichiers de déploiement alternatifs présents : `vercel.json`, `netlify.toml`.

---

## 4. Modèle de sécurité

Modèle **« allowlist explicite »** bien pensé :

- Un utilisateur est ADMIN **uniquement** si son UUID est dans la table `public.admin_users`.
  La fonction `public.is_admin()` (`SECURITY DEFINER`) est le prédicat central.
- `admin_users` : RLS activée **sans policy**, droits `anon`/`authenticated` révoqués → ingérable
  depuis le navigateur.
- **Toutes** les policies d'écriture/lecture admin reposent sur `is_admin()` ; pas de
  `auth.uid() IS NOT NULL`.
- Les écritures publiques directes (INSERT `orders` / `contact_messages` anon) sont **retirées** :
  seul le chemin Edge Function `service_role` subsiste.
- Frontend : `RequireAdmin` (garde de route) + retry du RPC `is_admin` pour absorber la race au
  `SIGNED_IN`.
- `sanitizeSearchTerm()` neutralise l'injection de filtre PostgREST (`.or()`), testé unitairement.
- Rate limiting **persistant** (table partagée, IP hachée) — adapté au scale horizontal.
- `images_admin_manage` sur `storage.objects` combine `bucket_id` **et** `is_admin()`.

**Points de vigilance sécurité :**
- `Access-Control-Allow-Origin: *` en dur dans `cors.ts`, alors que `isOriginAllowed()` existe.
  L'en-tête reste `*` même quand `ALLOWED_ORIGINS` est configuré — la protection repose donc sur le
  seul contrôle applicatif (403), pas sur le CORS navigateur. À aligner si l'on veut un CORS strict.
- `vercel.json` / `netlify.toml` : la restriction par User-Agent doit être revérifiée (le README
  signale que la redirection Netlify `force=true` n'est pas restreinte aux bots sans Edge Function).
- CSP définie dans `nginx/security-headers.inc` (non relu ici) — à valider qu'elle autorise bien
  `*.supabase.co`, Maps, Sentry.
---

## 5. Performance & optimisations

Le projet a fait l'objet d'une campagne d'optimisation poussée (documentée dans ~50 fichiers
`.md` à la racine et dans `docs/`, `load-tests/`, `k6/`).

- **React Query** : `staleTime`/`gcTime` par ressource (produits actifs 10 min, catégories 10 min,
  paramètres 15 min), `refetchOnWindowFocus: false`, `retry: 1`, `keepPreviousData` sur la
  pagination, **prefetch** de la page suivante du catalogue.
- **Requêtes étroites** : `select` ciblé par cas d'usage — `PRODUCT_SELECT_PUBLIC` (cartes) sans
  description/images normalisées, `PRODUCT_SELECT_PUBLIC_DETAIL` (fiche), `SITE_SETTINGS_SELECT_PUBLIC`
  (7 colonnes). Un `select('*')` évité = payload moindre.
- **Pas de `COUNT(*)` exact** sur le catalogue public : détection de page suivante via
  `limit = pageSize + 1`. Les stats admin utilisent un `HEAD` count.
- **Résolution slug→id côté client** (cache catégories/sous-catégories) : plus de requête serveur
  de résolution sur `/produits` filtré.
- **Images** : compression côté client (`browser-image-compression`, web worker) + génération de
  3 variantes (1600/800/400, WebP fallback JPEG) à l'upload, et `srcSet`/`sizes` en affichage
  (`lib/images.ts`). La carte ne charge jamais l'original 1600px.
- **Cache mémoire partagé** pour `site_settings` (TTL 10 min) → un clic WhatsApp ne déclenche plus
  de SELECT dédié.
- **Nginx/CDN** : gzip, assets immutable 1 an, `index.html` no-cache.
- **Scaling** : image stateless interchangeable, 3 réplicas, healthcheck sans dépendance Supabase.

**Observation** : le chunk `sentry-*.js` pèse **280 kB (92 kB gzip)** — c'est le plus gros chunk,
chargé de façon **eager** (`main.tsx` appelle `initSentry()`, `ErrorBoundary` importe `@sentry/react`).
Sentry (avec Replay + Tracing + Logs) est donc dans le chemin critique du premier chargement, alors
que le DSN est en réalité optionnel. Un chargement paresseux de Sentry (import dynamique après
`load`) allégerait sensiblement le démarrage public.

---

## 6. SEO

Stratégie **« Option A — prerendering statique »** documentée et cohérente :

- `scripts/prerender-products.mjs` (build-time) génère pour chaque produit actif :
  `dist/prerendered/produit/<slug>/index.html` (title/description/canonical/OG/Twitter + JSON-LD
  `Product` + `BreadcrumbList`), ainsi que `dist/sitemap.xml` et `dist/robots.txt`.
- `SITE_ORIGIN` = **source unique de vérité** (sitemap, canonicals, og:url) ; le domaine final n'est
  pas encore acheté (placeholder documenté). Docker refuse de builder sans `SITE_ORIGIN`.
- **Parité stricte** entre le HTML prérendu et la version React (mêmes titres, même JSON-LD), testée
  par revue : aucune donnée inventée (pas de faux sku/avis/adresse).
- Nginx sert le HTML prérendu **aux bots uniquement** (map User-Agent) ; les navigateurs reçoivent la
  SPA. Produit inconnu → **vrai 404** (jamais de soft-404 indexable).
- Côté React, `useSeo` gère title/description/canonical/OG/Twitter/robots + JSON-LD injecté et
  nettoyé à la navigation. Le catalogue est `noindex` dès qu'il est filtré (recherche/tri/promo/
  sous-catégorie/page > 1), la page catégorie est indexée.
- 404 et « produit introuvable » = `noindex`.

Bonne couverture. Point d'attention : le sitemap ne liste que les produits actifs **au moment du
build** — un produit publié après le build n'aura pas de fiche prérendue jusqu'au prochain
déploiement (limite assumée du choix statique).

---

## 7. Tests & qualité

**Couverture (99 tests, 13 fichiers) :**
- Services : `product` (18), `order` (10), `category` (7), `storage` (6), `whatsapp` (7).
- Hooks : `useProducts` (mutations optimistes + rollback), `useImageUpload`, `useLoginBackoff`.
- Libs : `product-promo`, `utils`.
- Composants : `SentryFeedbackButton`.
- Pages : `Auth` (validation, backoff, redirection).
- Edge Function `_shared/validation` (19 tests) — importé directement depuis `supabase/`.

**Qualité de l'outillage** : ESLint propre, Vitest configuré (coverage v8), Playwright E2E
(`e2e/smoke.spec.ts`) lancé par CI.

**Faiblesse** : la CI n'exécute **que** Playwright. `tsc`, `eslint`, `vitest` et le build ne sont pas
vérifiés en CI — ce qui laisse passer les 8 erreurs de type actuelles.

---

## 8. Points forts

1. **Architecture claire** : une seule couche touche Supabase (`services`), hooks minces, composants
   sans logique de données.
2. **Sécurité sérieuse** : allowlist admin explicite, RLS partout, écritures publiques via Edge
   Functions rate-limitées + validées, prix recalculé serveur, anti-injection PostgREST, honeypot.
3. **Performance travaillée** : cache React Query, requêtes étroites, images responsives, CDN,
   code splitting, no-COUNT.
4. **SEO abouti** : prerendering bot-aware, sitemap/robots générés, JSON-LD en parité, 404 propres.
5. **Robustesse** : ErrorBoundary + Sentry, verrous anti-double-clic (WhatsApp / panier),
   dégradation propre si la table `promos` manque, mutations optimistes avec rollback.
6. **Déploiement industrialisé** : Docker multi-stage, image stateless scalable, healthcheck.

---

## 9. Problèmes & dette technique identifiés

### 9.1 🔴 `tsc --noEmit` échoue — 8 erreurs de type (couche services)

Toutes dues au typage généré Supabase (`RejectExcessProperties`) confronté à des
`Record<string, unknown>` construits dynamiquement :

- `src/services/category.service.ts(49)` — `updateData` passé à `.update()`.
- `src/services/product.service.ts` — lignes 319, 325, 326, 327 (assignations `updateData.* = string|boolean`) et 368 (`.insert()`).
- `src/services/promo.service.ts(83)` — `updateData` passé à `.update()`.

**Impact** : aucune conséquence runtime (Vite/SWC ignore les types), mais le type-check échoue et une
CI `tsc` casserait. Le `tsconfig.json` racine est d'ailleurs très permissif (`strict: false`,
`noImplicitAny: false`, `strictNullChecks: false`).

**Piste de correction** : typer `updateData` avec les types d'insert/update générés
(`Database['public']['Tables']['products']['Update']`) plutôt que `Record<string, unknown>`.

### 9.2 🟠 Branding incohérent sur la page de connexion

`src/pages/auth/Auth.tsx` affiche encore **« CatalogueMaroc »** et le sous-titre
« Créez et partagez votre kissariya de produits », ainsi que la classe `gradient-primary`
(probablement d'un template d'origine). Le reste du site utilise « Kissariya Cosmétiques ». À corriger.

### 9.3 🟠 CORS `*` au lieu d'utiliser `ALLOWED_ORIGINS`

`cors.ts` renvoie toujours `Access-Control-Allow-Origin: *`. La variable `ALLOWED_ORIGINS` ne sert
qu'au contrôle applicatif `isOriginAllowed()` (403). Le navigateur, lui, accepte n'importe quelle
origine. Si un CORS strict est souhaité, refléter l'origine autorisée dans l'en-tête.

### 9.4 🟠 Sentry dans le bundle initial

`@sentry/react` (+ Replay) = 280 kB / 92 kB gzip chargé au démarrage même sans DSN. À charger
paresseusement (import dynamique) — d'autant que le DSN est optionnel et que `initSentry()` est un
no-op sans lui.

### 9.5 🟡 `useImageUpload` — compression principale sans plafond de taille

`optimizeImage()` fixe `maxWidthOrHeight: 1600` et `maxSizeMB: 0.3`, mais `uploadImageWithVariants()`
(utilisé pour les 3 variantes) appelle `optimizeToWidth()` **sans** `maxSizeMB` : les variantes
peuvent rester plus lourdes que prévu. À harmoniser si les variantes sont le chemin principal.

### 9.6 🟡 CI incomplète

Seul Playwright tourne. Ajouter un job `lint + tsc + vitest + build` éviterait de livrer un dépôt qui
ne type-check pas.

### 9.7 🟡 Prolifération de rapports à la racine

~50 fichiers `.md` (audits, rapports, plans) encombrant la racine du dépôt — à regrouper sous
`docs/` pour la lisibilité.

### 9.8 🟡 Divers

- `index.html` non relu — vérifier la cohérence des meta par défaut avec le prerender (SITE_ORIGIN).
- `contact.service.ts` : `.catch(() => ({ ok: true }))` renvoie `ok:true` par défaut sur réponse 200
  non-JSON — acceptable mais légèrement optimiste.
- `whatsapp.service.ts` envoie `customer_phone: whatsappNumber` (le numéro **vendeur**) dans le
  tracking de clic — champ détourné de sa sémantique ; sans gravité mais trompeur en base.

---

## 10. Recommandations priorisées

| Priorité | Action |
|---|---|
| **P1** | Corriger les 8 erreurs `tsc` (typer les payloads update/insert avec les types générés). |
| **P1** | Corriger le branding « CatalogueMaroc » dans `Auth.tsx`. |
| **P2** | Ajouter une CI `lint + tsc + vitest + build`. |
| **P2** | Charger Sentry en dynamique (hors chemin critique). |
| **P2** | Aligner le CORS sur `ALLOWED_ORIGINS` (ou documenter l'acceptation du `*`). |
| **P3** | Régénérer/mettre à jour les fiches prérendues après publication produit (job post-deploy). |
| **P3** | Plafonner la taille dans `optimizeToWidth` (variantes). |
| **P3** | Regrouper les `.md` de la racine sous `docs/`. |

---

## 11. Conclusion

Projet **mature, propre et bien conçu** pour un e-commerce piloté par Supabase : la sécurité (RLS +
Edge Functions rate-limitées), la performance (cache, images, CDN) et le SEO (prerendering)
sont traités avec un niveau de rigueur au-dessus de la moyenne. Le build et les 99 tests passent.

Les chantiers restants sont **ciblés** : un type-check à réparer, un branding à corriger, une CI à
compléter et Sentry à sortir du bundle initial. Aucun de ces points ne remet en cause l'architecture.
