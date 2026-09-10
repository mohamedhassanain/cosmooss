# Déploiement Cloudflare → Vercel — cosmooss.com

Guide exact pour brancher le domaine **cosmooss.com** derrière **Cloudflare** (DNS + CDN + WAF)
avec **Vercel** comme origine applicative.

```
Visiteur
  │
  ▼
Cloudflare (DNS + CDN + WAF)         ← proxy « orange » sur les enregistrements
  │
  ▼
Vercel (build Vite + prerender SEO)  ← origine (cname.vercel-dns.com)
  │
  ▼
Supabase (Auth / PostgreSQL / Storage) — appelé directement par le navigateur, jamais proxifié
```

---

## 1. Déployer sur Vercel

1. vercel.com → **Add New… → Project** → importer le dépôt GitHub **`cosmooss`**.
2. Framework preset : **Vite**. Vercel lit `vercel.json` (`buildCommand = npm run build && npm run prerender`, `outputDirectory = dist`).
3. **Settings → Environment Variables** (Production + Preview) :
   | Nom | Valeur |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://abtgtckjuysglxsqzkjm.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | votre clé anon (publique) |
   | `SITE_ORIGIN` | `https://cosmooss.com` |
4. Déployer. Vercel fournit une URL `*.vercel.app` — vérifier qu'elle affiche l'app avant de brancher le domaine.

> Le `vercel.json` sert le **HTML prérendu aux robots** (WhatsApp/Facebook/Googlebot) sur `/produit/:slug`
> et la SPA aux navigateurs. Le prerender écrit `dist/prerendered/produit/<slug>/index.html`.

## 2. Créer la zone Cloudflare

1. dash.cloudflare.com → **Add a site** → `cosmooss.com` → plan **Free**.
2. Cloudflare affiche **2 nameservers** (ex. `ada.ns.cloudflare.com`, `rob.ns.cloudflare.com`).

## 3. Basculer les nameservers chez Hostinger

1. Hostinger hPanel → **Domaines → cosmooss.com → Serveurs DNS / Nameservers**.
2. Remplacer les nameservers Hostinger par les **2 nameservers Cloudflare**.
3. Attendre l'activation (de quelques minutes à quelques heures ; Cloudflare envoie un e-mail « site actif »).

## 4. Enregistrements DNS dans Cloudflare

Supprimer le parking Hostinger, puis créer (Proxy **☁️ Proxied** = nuage orange) :

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| CNAME | `@` | `cname.vercel-dns.com` | ☁️ Proxied |
| CNAME | `www` | `cname.vercel-dns.com` | ☁️ Proxied |

> Si Cloudflare refuse un CNAME sur l'apex (selon le plan), utiliser :
> `A  @  76.76.21.21` (IP Vercel) + `CNAME  www  cname.vercel-dns.com`.
> Ne jamais créer d'enregistrement pour `supabase.co` : l'app appelle Supabase directement.

## 5. SSL/TLS

- **SSL/TLS → Overview → Full (strict)** (Vercel présente un certificat valide).
- **Edge Certificates → Always Use HTTPS : ON**.

## 6. Règles de cache (⚠️ critique)

**Règle 1 — assets immutables (cache)**
```
Rules → Cache Rules → Create rule
Rule name: cosmooss immutable assets
When: Hostname equals cosmooss.com AND URI Path starts with /assets/
Then: Eligible for cache · Cache TTL 1 month
```
Les fichiers `/assets/*` sont hashés par Vite (contenu-addressed) → sûrs à cacher 1 an.

**Règle 2 — tout le reste : BYPASS du cache**
```
Rule name: cosmooss bypass HTML (SPA + prerender)
When: Hostname equals cosmooss.com
Then: Bypass cache
```

> ⚠️ **NE PAS mettre en cache le HTML.** La même URL `/produit/:slug` renvoie **du HTML prérendu aux robots**
> et **la SPA aux navigateurs** (détection par User-Agent côté Vercel). Le cache Cloudflare indexe par URL
> seulement : s'il cachait `/produit/:slug`, un navigateur pourrait recevoir la version « bot » (avec
> `<meta http-equiv="refresh">` vers la même URL) → **boucle de rechargement / contenu erroné**.
> Seuls `/assets/*` sont cachés ; le HTML, `/produit/*`, `/sitemap.xml`, `/robots.txt` restent sur l'origine
> (Vercel répond déjà `no-cache` sur l'HTML).

**Invariant de sécurité (jamais cacher) :** `/rest/v1/*`, `/auth/v1/*`, `/admin*`, toute requête avec
en-tête `Authorization`. (Ces routes Supabase sont sur `*.supabase.co`, hors de notre zone — sauf à vouloir
un proxy explicite, ce qui est déconseillé.)

## 7. Réglages sécurité Cloudflare

| Réglage | Valeur | Raison |
|---|---|---|
| SSL/TLS | Full (strict) | TLS bout-en-bout |
| Always Use HTTPS | ON | redirection http→https |
| Min TLS | 1.2 | compatibilité |
| **Bot Fight Mode** | **OFF** | sinon les robots (WhatsApp/Facebook/Googlebot) sont bloqués → **les aperçus de partage et le SEO cassent** |
| WAF Managed Rules | défaut | ne pas passer en « High » |
| Cache wide « cache everything » | **désactivé** | évite de cacher du HTML dépendant du User-Agent |

## 8. Ajouter le domaine dans Vercel

Vercel → projet → **Settings → Domains → Add** `cosmooss.com` (+ `www`).
Vercel détecte les DNS Cloudflare et émet le certificat. Statut attendu : **Valid**.

## 9. Vérification après activation

```bash
# DNS résout vers Cloudflare (IP Cloudflare, pas le parking Hostinger)
nslookup cosmooss.com

# L'app est servie (doit renvoyer le titre « Cosmooss »)
curl -s https://cosmooss.com/ | grep -o '<title>[^<]*</title>'

# Asset caché au niveau Cloudflare (2ᵉ requête → cf-cache-status: HIT)
H=$(curl -s https://cosmooss.com/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -sI "https://cosmooss.com$H" | grep -i 'cf-cache-status\|cache-control'
curl -sI "https://cosmooss.com$H" | grep -i 'cf-cache-status'

# HTML : NE DOIT PAS être mis en cache (pas de cf-cache-status: HIT)
curl -sI https://cosmooss.com/ | grep -i 'cf-cache-status\|cache-control'

# Aperçu bot : le HTML prérendu (og:title) est bien renvoyé aux robots
curl -s -A "WhatsApp" https://cosmooss.com/produit/<slug> | grep og:title

# Sitemap/robots sur le bon domaine
curl -s https://cosmooss.com/sitemap.xml | head -n 3
curl -s https://cosmooss.com/robots.txt | grep -i sitemap
```

## 10. À ne pas oublier (hors dépôt)

- **Edge Functions Supabase** : déployer `create-order` / `create-contact` et définir les secrets
  (`SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_HASH_SECRET`, `ALLOWED_ORIGINS=https://cosmooss.com`).
- **Auth Supabase** : désactiver l'inscription publique, créer le compte admin, l'ajouter à `public.admin_users`.
- **Clé service_role** partagée en clair : la considérer comme compromise et la **régénérer** (Settings → API).
