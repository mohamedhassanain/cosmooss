# DOCKER DEPLOYMENT — COSMOOSS

Production deployment guide for the Docker + Nginx frontend build.
Architecture stays unchanged: **Users → CDN (Cloudflare) → Docker/Nginx → Supabase**.
Nginx serves only the static React build. Supabase remains the only backend
(Auth / PostgreSQL / PostgREST / Storage). No backend, no Redis, no database
in Docker.

---

## 1. Prerequisites

- Docker ≥ 24 (tested 29.5.3) with a running engine
- Docker Compose v2 (tested v5.1.4) — only if using the compose path
- `.env` at repo root with the public VITE_* variables (same as the current
  Netlify/Vercel build — see ENV_SECURITY_REPORT.md; all are browser-public)

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>     # public by design
SITE_ORIGIN=https://cosmooss.com             # REQUIRED — origin de production
VITE_SUPABASE_PROJECT_ID=<project ref>       # optional
VITE_SENTRY_DSN=                             # optional
VITE_SENTRY_ENVIRONMENT=production           # optional
RUN_PRERENDER=true                           # optional — déterministe (défaut true)
```

`SITE_ORIGIN` est la **single source of truth** du SEO de production : elle pilote
`sitemap.xml`, `robots.txt` et les canonicals/og:url des fiches produit prérendues.
Le domaine de production est `https://cosmooss.com` (cf. `.env.example`).

---

## 2. Build

### Option A — Docker Compose (recommended locally)

Compose reads `.env` automatically and passes the VITE_* values as build args:

```powershell
docker compose up -d --build
# → http://localhost:8080
```

### Option B — plain docker build

```powershell
docker build `
  --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=<anon key> `
  --build-arg SITE_ORIGIN=https://cosmooss.com `
  -t my-ecommerce-frontend .
```

Optional build args: `VITE_SUPABASE_PROJECT_ID`, `VITE_SENTRY_DSN`,
`VITE_SENTRY_ENVIRONMENT`. `RUN_PRERENDER=true` is the **default** — it runs
`npm run prerender` at build time to generate `dist/sitemap.xml`,
`dist/robots.txt` and `dist/prerendered/produit/[slug]/index.html` SEO pages
(requires network access to Supabase during the build). Set `RUN_PRERENDER=false`
only for cache-only CI/test images.

> The build **fails fast** if `VITE_SUPABASE_URL` or
> `VITE_SUPABASE_PUBLISHABLE_KEY` are missing (`RUN test -n ...`), and **if
> `SITE_ORIGIN` is missing while `RUN_PRERENDER=true`** (the prerender needs the
> production origin for sitemap/canonical/robots) — a broken or SEO-incomplete
> image can never ship.

---

## 3. Run (any host)

```powershell
docker run -d --name cosmooss-web -p 8080:80 my-ecommerce-frontend
```

Nginx listens on :80 inside the container; map any external port.

---

## 4. What Nginx does (in this image)

| Concern | Behavior |
|---|---|
| Static assets `/assets/*-HASH.js\|css` | `Cache-Control: public, max-age=31536000, immutable` (1 year) |
| `index.html` / SPA routes (`/`, `/produits`, `/produit/:slug`, `/admin`, …) | `Cache-Control: no-cache, no-store, must-revalidate` + SPA fallback to `/index.html` |
| `/favicon-app.svg`, `/robots.txt`, `/og-image.png` | `Cache-Control: public, max-age=3600` |
| Missing files under `/assets/` | 404 (no SPA fallback) |
| Dotfiles (`/.env`, …) | 403 — denied |
| Gzip | text assets only (NOT images/woff2 — already compressed) |
| Security headers | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy on **every** response |

Nothing is proxied. Auth, orders, admin data and Storage writes continue to go
directly from the browser to Supabase — never through Nginx.

---

## 5. Production exposure (TLS + CDN)

1. Put **Cloudflare** (or your CDN) in front of the origin for TLS, caching
   and AVIF/WebP edge transforms later. Recommended cache rules:
   - `/assets/*` → cache, `1 week` edge / respect origin `immutable`
   - `/` and `/produits*` → cache, short TTL (or revalidate) so price/catalog
     changes propagate quickly
   - `/admin*` → **no cache** (private UI)
2. Terminate TLS at the edge (Cloudflare Full), or at the origin with a proxy
   that manages certs (Caddy, Traefik) or Nginx + certbot. This image exposes
   plain HTTP on :80 — termination happens in front of it.

### Bare-metal Nginx + TLS (no Cloudflare) example (root Nginx, not the container)

```nginx
server {
    listen 443 ssl http2;
    server_name www.example.com example.com;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;   # the cosmooss-web container
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name www.example.com example.com;
    return 301 https://$host$request_uri;
}
```

---

## 6. Updating / rollback

```powershell
# rebuild + restart with latest code
docker compose up -d --build

# rollback to previous image
docker stop cosmooss-web && docker rm cosmooss-web
docker run -d --name cosmooss-web -p 8080:80 <previous-image-tag>
```

CI/CD tip: build once with a tag (e.g. `cosmooss-web:$GIT_SHA`), push to a
registry, deploy by tag. `index.html` is never cached (`no-store`) so a new
deploy's asset hashes are picked up immediately even if the HTML was cached
by an intermediate proxy for a short window.

---

## 7. Security notes

- **No secrets in the image**: `.env*` is excluded via `.dockerignore`; only
  the public VITE_* values are baked into the bundle (same as every static
  deploy). Verified: inspecting the running image finds no `.env*` files and
  no `service_role` string in the served HTML.
- **RLS untouched**: browser talks to Supabase with the anon key; Supabase
  RLS policies continue to protect all tables. Nginx adds no bypass.
- `VITE_SUPABASE_PUBLISHABLE_KEY` triggers a Docker lint warning
  (`SecretsUsedInArgOrEnv`) — it is a **false positive**: this is the public
  anon key, required at build time and shipped in every web bundle today.
  Documented in ENV_SECURITY_REPORT.md §1.
- CSP is enforced on every response. If you add a new external origin
  (fonts, analytics, embeds), update `nginx/security-headers.inc` and rebuild.

---

## 8. Verification checklist (all performed 13/08/2026)

- [x] `docker build` succeeds from clean state (lockfile regenerated inside
      `node:22-alpine` so npm 10.x resolves all platform deps)
- [x] `nginx -t` passes with no warnings
- [x] `/`, `/produits`, `/produit/:slug`, `/admin`, `/admin/login` → 200
- [x] missing `/assets/*` → 404; `/.env` → 403
- [x] CSP + security headers present on all responses
- [x] hashed assets `immutable` 1y; `index.html` `no-store`
- [x] app renders (home + catalog) in a real browser with zero CSP violations
- [x] no `.env*` / `service_role` inside the image; image size ~75 MB
