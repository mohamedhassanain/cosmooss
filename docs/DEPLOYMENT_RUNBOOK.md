# Runbook de mise en ligne — Cosmooss (Vercel + Cloudflare + Supabase)

> Chemin choisi : **GitHub → Vercel (`*.vercel.app`) → tests → Cloudflare → `cosmooss.com` → Supabase → SEO → Lancement.**
> Ce document remplace les guides « Docker/Nginx » pour tout ce qui concerne le domaine public.
> Architecture cible :
>
> ```
> Visiteur
>   │
>   ▼
> Cloudflare (DNS + CDN + WAF)        ← proxy « orange »
>   │
>   ▼
> Vercel (build Vite + prerender SEO) ← origine
>   │
>   ▼
> Supabase (Auth / Postgres / Storage) — appelé directement par le navigateur
> ```

---

## 0. Pré-vol (à faire une fois, avant tout)

### 0.1 État du dépôt (vérifié)

```powershell
git -C . status            # arbre propre, branche main
npm run typecheck          # 0 erreur
npm run lint               # 0 erreur
npx vitest run             # 99 tests verts
npm run build              # vite build OK
```

Le build **complet** de Vercel est `npm run build && npm run prerender` (défini dans `vercel.json`).

### 0.2 ⚠️ GATE BLOQUANT — données produits

Le projet Supabase de production (`https://abtgtckjuysglxsqzkjm.supabase.co`, défini dans `.env` / `.env.example`)
répond aujourd'hui avec **8 catégories mais 0 produit**. Un catalogue vide à la mise en ligne
n'est pas un lancement valide. **Avant de connecter le domaine :**

1. Se connecter à `/admin/login` du site déployé.
2. Créer les produits (Admin → Produits → Nouveau) **avec `is_active = true`**.
3. Re-vérifier :

```powershell
# Compte les produits actifs visibles par la clé anon (doit être > 0)
$k='<VITE_SUPABASE_PUBLISHABLE_KEY>'
(Invoke-RestMethod "https://abtgtckjuysglxsqzkjm.supabase.co/rest/v1/products?select=id&is_active=eq.true" -Headers @{apikey=$k; Authorization="Bearer $k"}).Count
```

> Si 0 produits persistants alors que l'admin en a créé : vérifier les policies RLS de `products`
> (`supabase/database.sql`) — une absence de policy `SELECT` publique renvoie `[]` silencieusement.

### 0.3 Variables d'environnement à définir dans Vercel

| Nom | Valeur | Portée |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://abtgtckjuysglxsqzkjm.supabase.co` | Production + Preview |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clé anon (publique) | Production + Preview |
| `SITE_ORIGIN` | `https://cosmooss.com` | Production + Preview |
| `VITE_SENTRY_DSN` | DSN Sentry (voir `.env`) | Production |
| `VITE_SENTRY_ENVIRONMENT` | `production` | Production |

> `SITE_ORIGIN` sert au prerender (sitemap, canonicals, OG). S'il manque, le build ne casse plus :
> il retombe sur `https://cosmooss.com` (la seule origine de production). **Le définir explicitement garde les URLs déterministes.**

---

## 1. GitHub — **FAIT**

Le dépôt `mohamedhassanain/cosmooss` est à jour (commit `4cde256` sur `main`) :

```
prerender SEO (suppression de la boucle meta refresh), og:image page d'accueil,
types Supabase (colonnes products manquantes), services typés (tsc clean),
package.json (engines node>=20, script typecheck).
```

---

## 2–3. Vercel — créer le projet et déployer

1. vercel.com → **Add New… → Project** → importer `mohamedhassain/cosmooss`.
2. Framework preset : **Vite** (Vercel lit `vercel.json` : `buildCommand`, `outputDirectory=dist`, rewrites bots, headers).
3. **Settings → Environment Variables** : ajouter les 5 variables du §0.3 (Production + Preview).
4. **Deploy**.
5. Récupérer l'URL de production, de la forme `https://<projet>.vercel.app`.

> Le `vercel.json` sert le **HTML prérendu** aux robots d'aperçu (`facebookexternalhit`,
> `Twitterbot`, `WhatsApp`…) sur `/produit/:slug`, et la **SPA** à tout le reste.
> Les fiches prérendues ne contiennent **plus** de `<meta http-equiv="refresh">` : une
> redirection vers la même URL faisait boucler les crawlers → page non indexable.

---

## 4. Tester TOUT en production (`*.vercel.app`)

### 4.1 Vérification automatisée

```powershell
node scripts/verify-deployment.mjs https://<projet>.vercel.app --supabase https://abtgtckjuysglxsqzkjm.supabase.co
```

Le script vérifie : `GET /` + `<title>` + `og:image` + `twitter:card` + `#root`, en-têtes de
sécurité, `robots.txt` (Sitemap + blocage `/admin`), `sitemap.xml` (XML + URLs), cache
`immutable` des `/assets/*`, fallback SPA (`/produits`, `/contact`), aperçu bot prérendu
(si un produit existe). Code de sortie `0` = tous les contrôles critiques passent.

### 4.2 Parcours fonctionnels manuels (navigateur)

- [ ] Accueil : hero, sections, carrousels scrollables.
- [ ] Catalogue : filtres + pagination + recherche (tester `, ( ) %` → aucune erreur).
- [ ] Fiche produit : galerie, bouton WhatsApp (ouvre `wa.me`).
- [ ] Panier : ajout/retrait, persistance après rechargement.
- [ ] `/admin/login` : connexion admin ; CRUD produit (image + localisation) ; catégories ; commandes ; paramètres ; publicités.
- [ ] Rafraîchir directement `/admin` (deep-link) → le guard redirige correctement.
- [ ] Responsive : tester une largeur mobile (≤ 390 px), rien ne débordé.
- [ ] Console navigateur : aucune erreur rouge bloquante ; Sentry reçoit les erreurs (si DSN).

---

## 5. Corriger les problèmes éventuels

Problèmes déjà corrigés dans le dépôt (commit `4cde256`) : boucle meta refresh des robots,
`og:image` manquant, types `types.ts` désynchronisés du schéma, `.update()` non typés.

Si un nouveau problème apparaît en test :

| Symptôme | Cause probable | Correctif |
|---|---|---|
| Build Vercel échoue sur `prerender` | `VITE_SUPABASE_*` absent | définir les variables §0.3 puis redéployer |
| Catalogue vide en prod | 0 produit actif / RLS | §0.2 |
| 404 sur `/produits` (rechargement) | rewrite SPA | vérifier `vercel.json` → `/(.*)` → `/index.html` |
| Aperçu WhatsApp sans image | `og:image` absent du HTML brut | vérifier `index.html` + le prerender produit |
| Admin inaccessible | UUID absent de `public.admin_users` | SQL Editor : `INSERT INTO public.admin_users (user_id) VALUES ('<uuid>');` |

---
## 6. Cloudflare (CDN + DNS + WAF devant Vercel)

### 6.1 Créer la zone

1. dash.cloudflare.com → **Add a site** → `cosmooss.com` → plan **Free**.
2. Cloudflare affiche **2 nameservers** (ex. `ada.ns.cloudflare.com`, `rob.ns.cloudflare.com`).

### 6.2 Basculer les nameservers chez Hostinger

> État actuel vérifié : `cosmooss.com` → `2.57.91.91` (Hostinger) et sert une page
> « Parked Domain » (`noindex`). Les nameservers sont donc encore ceux d'Hostinger.

1. Hostinger hPanel → **Domaines → cosmooss.com → Serveurs DNS / Nameservers**.
2. Remplacer les nameservers Hostinger par les **2 nameservers Cloudflare**.
3. Attendre l'activation (minutes à quelques heures — Cloudflare envoie un e-mail « site actif »).

### 6.3 Enregistrements DNS (proxy « orange »)

Supprimer le parking Hostinger, puis créer :

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| CNAME | `@` | `cname.vercel-dns.com` | ☁️ Proxied |
| CNAME | `www` | `cname.vercel-dns.com` | ☁️ Proxied |

> Si Cloudflare refuse un CNAME sur l'apex (selon le plan) : `A  @  76.76.21.21` (IP Vercel)
> + `CNAME  www  cname.vercel-dns.com`.
> **Ne jamais** créer d'enregistrement pour `*.supabase.co` : l'app appelle Supabase directement.

### 6.4 SSL/TLS

- **SSL/TLS → Overview → Full (strict)** (Vercel présente un certificat valide).
- **Edge Certificates → Always Use HTTPS : ON**, **Minimum TLS 1.2**.

### 6.5 Cache Rules (⚠️ critique — ne cacher QUE les assets)

**Règle 1 — assets immuables (cache)**
```
Rules → Cache Rules → Create rule
Rule name: cosmooss immutable assets
When:  Hostname equals cosmooss.com AND URI Path starts with /assets/
Then:  Eligible for cache · Cache TTL 1 month
```

**Règle 2 — tout le reste : BYPASS**
```
Rule name: cosmooss bypass HTML
When:  Hostname equals cosmooss.com
Then:  Bypass cache
```

> ⚠️ **NE PAS mettre le HTML en cache.** La même URL `/produit/:slug` renvoie **du HTML
> prérendu aux robots** et **la SPA aux navigateurs** (détection par User-Agent côté Vercel).
> Le cache Cloudflare indexe par URL : s'il cachait ce HTML, un navigateur pourrait recevoir
> la version « bot ». Seuls `/assets/*` sont cachés.
> **Jamais de cache sur** `/rest/v1/*`, `/auth/v1/*`, `/admin*`, ni toute requête `Authorization`.

### 6.6 Réglages sécurité

| Réglage | Valeur | Raison |
|---|---|---|
| SSL/TLS | Full (strict) | TLS bout-en-bout |
| Always Use HTTPS | ON | redirection http→https |
| Min TLS | 1.2 | compatibilité |
| **Bot Fight Mode** | **OFF** | sinon WhatsApp/Facebook/Googlebot sont bloqués → aperçus + SEO cassés |
| WAF Managed Rules | défaut | ne pas passer en « High » |

---

## 7. `cosmooss.com` → Cloudflare → Vercel

1. Vercel → projet → **Settings → Domains → Add** `cosmooss.com` (puis `www`).
2. Vercel détecte les DNS Cloudflare et émet le certificat. Statut attendu : **Valid**.
3. Vercel redirige automatiquement `www` → apex (ou l'inverse selon la config).
4. Vérifier :

```powershell
nslookup cosmooss.com                 # doit résoudre vers une IP Cloudflare (104.x / 172.67.x), PAS 2.57.91.91
node scripts/verify-deployment.mjs https://cosmooss.com --supabase https://abtgtckjuysglxsqzkjm.supabase.co
```

Le script doit désormais afficher `cf-cache-status` sur un asset (`HIT` au 2ᵉ appel) et
l'absence de `cf-cache-status: HIT` sur le HTML.

---

## 8. Supabase — Auth & URLs de production

Dans le **Dashboard Supabase** (projet `abtgtckjuysglxsqzkjm`) :

1. **Authentication → URL Configuration**
   - **Site URL** : `https://cosmooss.com`
   - **Redirect URLs** : ajouter `https://cosmooss.com/**`, `https://www.cosmooss.com/**`
     et `https://<projet>.vercel.app/**` (pour les previews).
2. **Authentication → Providers → Email** : « Allow new users to sign up » **DÉSACTIVÉ** (aucune inscription publique ; comptes admin créés à la main).
3. **Admin allowlist** : l'UUID du compte admin doit être dans `public.admin_users`
   (`INSERT INTO public.admin_users (user_id) VALUES ('<uuid>');` dans le SQL Editor).
4. **Edge Functions** (écritures visiteurs — commandes/contact), si utilisées :
   ```bash
   supabase functions deploy create-order
   supabase functions deploy create-contact
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role> \
     RATE_LIMIT_HASH_SECRET=<secret aléatoire> \
     ALLOWED_ORIGINS=https://cosmooss.com,https://www.cosmooss.com
   ```
5. **Storage** : vérifier que les buckets publics (images produits) sont accessibles depuis le navigateur.

> Rappel sécurité : la clé `service_role` ne doit **jamais** être exposée côté client ni committée.
> Si elle a déjà circulé en clair, la **régénérer** (Settings → API).

---

## 9. SEO final + Google Search Console

### 9.1 Vérification de propriété (Cloudflare, sans code)

1. Search Console → **Add property** → **Domain** → `cosmooss.com`.
2. Google donne un enregistrement `TXT` (`google-site-verification=…`).
3. Cloudflare → **DNS → Add record** → `TXT` `@` avec la valeur → **Verify** dans Search Console.
   (Alternative : préfixe d'URL `https://cosmooss.com` + balise HTML — mais la vérif DNS est plus robuste.)

### 9.2 Sitemap & inspection

1. Search Console → **Sitemaps** → soumettre `https://cosmooss.com/sitemap.xml`.
2. **Inspection d'URL** : tester `https://cosmooss.com/` et une fiche produit ;
   confirmer « Page indexable », canonical correct, données structurées valides.
3. Vérifier les aperçus sociaux (opengraph.xyz / le débogueur Facebook) sur `/` et une fiche produit.

### 9.3 Liste SEO à confirmer en production

- [ ] `https://cosmooss.com/robots.txt` → `Sitemap: https://cosmooss.com/sitemap.xml` + `Disallow: /admin`.
- [ ] `https://cosmooss.com/sitemap.xml` → toutes les URLs en `https://cosmooss.com`, **aucun** `/admin`, `/auth`, `/checkout`.
- [ ] Chaque fiche produit : `<link rel="canonical">`, JSON-LD `Product` (+ `BreadcrumbList` si catégorie).
- [ ] `og:title` / `og:image` présents dans le **HTML brut** (sans JS) sur `/` et `/produit/:slug`.
- [ ] `hreflang`/`og:locale` = `fr_MA` (déjà en place).

---

## 🚀 Lancement

Séquence finale :

1. §0.2 données produits OK (catalogue non vide).
2. §4 tests `*.vercel.app` verts.
3. §6–7 domaine derrière Cloudflare → Vercel, SSL **Valid**.
4. §8 Supabase Site URL / Redirect URLs = `https://cosmooss.com`.
5. §9 sitemap soumis + propriété vérifiée.
6. `node scripts/verify-deployment.mjs https://cosmooss.com` → **0 échec critique**.

## Rollback (sans destruction)

| Incident | Action |
|---|---|
| Domaine cassé | Vercel → Domains → retirer `cosmooss.com` ; Cloudflare → repasser l'enregistrement en **DNS only** (gris) |
| Cache sert du HTML obsolète | Cloudflare → supprimer la règle « immutable assets » ; Purge Everything |
| Mauvaise version déployée | Vercel → Deployments → **Promote** un déploiement précédent |
| Régression code | `git revert <sha>` puis push (redéploiement automatique) |

Aucune étape de ce runbook ne modifie de façon destructive la base de données.
