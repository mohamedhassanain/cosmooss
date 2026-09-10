# Checklist de déploiement production — Cosmooss

> À cocher **avant** toute mise en ligne publique du site.

## 1. Supabase

- [ ] Exécuter `supabase/database.sql` dans le SQL Editor (idempotent, rejouable).
- [ ] Vérifier que les policies RLS admin utilisent `public.is_admin()` :
      `SELECT policyname FROM pg_policies WHERE tablename = 'orders';`
- [ ] Vérifier l'allowlist admin : `SELECT user_id FROM public.admin_users;` — l'UUID de chaque
      compte admin doit y figurer (créés manuellement dans Dashboard → Authentication → Users).
      Ajouter/retirer un admin : SQL Editor → `INSERT INTO public.admin_users (user_id) VALUES ('<uuid>');`
      / `DELETE ...` (RLS sans policy → les clients anon/authenticated ne peuvent jamais le faire).
- [ ] Remplacer le numéro WhatsApp de fallback `+212600000000` par le vrai numéro dans `site_settings`.
- [ ] Activer **2FA / captcha** sur le projet Supabase (Auth → Providers) si disponible.
- [ ] Déployer les Edge Functions publiques (écritures visiteurs — rate limiting + validation) :
      `supabase functions deploy create-order` et `supabase functions deploy create-contact`
      avec les secrets `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_HASH_SECRET`, `ALLOWED_ORIGINS`.
      Vérifier que les INSERT anon directs `POST /rest/v1/orders` et
      `POST /rest/v1/contact_messages` sont bien bloqués par RLS (aucune policy INSERT publique).

## 2. Build & prerendering SEO (Docker déterministe)

`docker compose build` (ou `docker build`) exécute **automatiquement** `vite build` **puis**
`npm run prerender` (`RUN_PRERENDER=true` par défaut) → l'image contient toujours :

- `sitemap.xml` (racine `dist/`, URLs publiques uniquement)
- `robots.txt` généré avec `SITE_ORIGIN` (remplace le placeholder `public/robots.txt`)
- `dist/prerendered/produit/[slug]/index.html` par produit actif (Product JSON-LD + BreadcrumbList)

Le build local sans Docker nécessite deux commandes :

```bash
# Depuis la racine, avec les variables du projet :
VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... SITE_ORIGIN=https://votre-domaine.fr \
  npm run build && npm run prerender
```

- [ ] `SITE_ORIGIN` est définie dans `.env` (ou `--build-arg`) — obligatoire : `docker compose build` refuse de builder sans elle.
- [ ] Le dossier `dist/` contient `index.html` (SPA), `sitemap.xml`, `robots.txt` **et** `dist/prerendered/produit/[slug]/index.html` (SEO).
- [ ] `curl -s https://votre-domaine.fr/produit/[slug]` avec un User-Agent bot (ex: `WhatsApp`) retourne
      les meta tags `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card` **dans le HTML brut**
      (sans exécuter de JavaScript).
- [ ] Un navigateur normal (`Mozilla/5.0`) reçoit l'app React (le HTML statique le redirige via
      `<meta http-equiv="refresh">`).
- [ ] Nginx (Docker) sert le HTML prérendu aux bots sur `/produit/:slug` (voir `nginx/default.conf`).

## 3. Cloudflare (recommandé devant Vercel/Netlify)

Une fois le domaine connecté à Cloudflare :

1. **DNS** : ajouter l'enregistrement (A/AAAA/CNAME) pointant vers l'hébergeur (Vercel/Netlify).
   Mode proxy activé (orange) pour que Cloudflare cache.

2. **Cache Rules** (Rules → Cache Rules → Create Rule) — règles **sûres uniquement** :

```
Rule name: Cache assets immutable
When incoming requests match:
  URI Path → starts with → /assets
Cache eligibility: Eligible for cache
Cache TTL: 1 month
```

```
Rule name: Respecter l'origine (SPA + admin)
When incoming requests match:
  Hostname → equals → votre-domaine.fr
Cache eligibility: Eligible for cache
Cache status: Use cache-control header if present, bypass cache if absent
```

> ⚠️ **NE PAS** créer de règle de cache sur `/rest/v1/*` (API Supabase) ni sur
> `/auth/v1/*`. Les réponses PostgREST dépendent du JWT de l'utilisateur (RLS) :
> un admin connecté reçoit des lignes protégées avec la même URL qu'un visiteur.
> Mettre cette route en cache = risque de fuite de données privées. Même sans
> authentification, produits/promos/prix n'ont aucun canal d'invalidation sûr.
> Voir `CLOUDFLARE_CACHE_RULES.md` pour le détail.

3. **Vérification** (assets statiques uniquement) :

```bash
H=$(curl -s "https://votre-domaine.fr/" | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -sI "https://votre-domaine.fr$H" -H "User-Agent: Mozilla/5.0"
# 2e requête : cf-cache-status: HIT  ← asset
# index.html / /admin : doivent retourner no-store (jamais HIT)
```

> Si le domaine n'est pas derrière Cloudflare, au minimum activer le cache de l'hébergeur
> (Vercel : Cache-Control par défaut sur les assets ; Netlify : `Cache-Control: public, max-age` via `netlify.toml`).

## 4. Tests & qualité

- [ ] `npm run lint` → 0 erreur.
- [ ] `npm test` → 35+ tests verts.
- [ ] `npm run build` → succès (warning de taille de chunk 600 kB accepté pour le MVP).

## 5. Parcours fonctionnels manuels

- [ ] Accueil : hero, sections, carrousels scrollables.
- [ ] Catalogue : filtres + pagination + recherche (y compris caractères spéciaux `, ( ) %` → pas d'erreur).
- [ ] Détail produit : galerie multi-images/vidéo, location, bouton WhatsApp (ouvre `wa.me`).
- [ ] Back-office : login admin, CRUD produit (avec image + localisation), catégories/sous-catégories,
      commandes (statut), paramètres, publicités (ordre drag & drop).
- [ ] Panier : ajout/retrait, persistance localStorage, commande WhatsApp.
- [ ] PC (souris) : clic produit → nouvel onglet ; mobile/tablette → même onglet.

## 6. Monitoring

Sentry est **implémenté** (`src/integrations/sentry.ts`, initialisé dans `main.tsx`) :
- No-op automatique si `VITE_SENTRY_DSN` est absent/vide → sans risque en dev.
- Trace des performances échantillonnée à 10 %, session replay uniquement sur erreur.
- Les erreurs de mutation React Query et les erreurs React (`ErrorBoundary`) remontent avec le contexte.

Le DSN est déjà configuré dans `.env` (fichier local, gitignoré) :

```
VITE_SENTRY_DSN=https://6769946aaba8d3325e22de4e155ea422@o4511841426800640.ingest.de.sentry.io/4511841433747536
VITE_SENTRY_ENVIRONMENT=production
```

Pour la **production** (Vercel/Netlify), copier ces deux variables dans
Settings → Environment Variables et redéployer. Les premières erreurs apparaissent
dans Sentry (projet `mohamed-hassanain`) sous quelques minutes.

Outil de charge : `scripts/k6-load-test.js` (voir `docs/load-test-results.md`).
