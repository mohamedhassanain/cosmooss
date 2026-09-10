# =====================================================================
# COSMOOSS — production Dockerfile (frontend only)
# ---------------------------------------------------------------------
# Architecture stays: browser → Cloudflare → Docker/Nginx → Supabase.
# Nginx ONLY serves the React/Vite static build. No backend is created.
# Supabase (Auth/PostgreSQL/Storage) remains the sole backend.
#
# Stage 1 (build) : node LTS alpine → npm ci → vite build + prerender SEO.
# Stage 2 (runtime) : nginx alpine → copy dist/ → serve static files.
#
# Required build args (browser-public only, never secrets):
#   VITE_SUPABASE_URL             (https://xxx.supabase.co)
#   VITE_SUPABASE_PUBLISHABLE_KEY (anon/publishable key)
#   SITE_ORIGIN                   (https://votre-domaine.com — REQUIRED
#                                  quand RUN_PRERENDER=true: pilote
#                                  sitemap.xml, robots.txt, canonicals
#                                  et og:url des pages prérendues)
# Optional build args:
#   VITE_SUPABASE_PROJECT_ID
#   VITE_SENTRY_DSN
#   VITE_SENTRY_ENVIRONMENT
#   RUN_PRERENDER=true|false      (default true — build production
#                                  déterministe : sitemap + fiches
#                                  prérendues + robots.txt)
#
# docker-compose.yml reads the root .env automatically and passes the
# VITE_* values as build args. Plain docker build requires --build-arg:
#   docker build --build-arg VITE_SUPABASE_URL=... \
#                --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
#                --build-arg SITE_ORIGIN=https://votre-domaine.com \
#                -t my-ecommerce-frontend .
# =====================================================================

# ---------------- Stage 1: build ----------------
FROM node:22-alpine AS build

WORKDIR /app

# Browser-public configuration (baked into the bundle, same as Netlify/Vercel).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT

# Production origin for the prerendered SEO (sitemap/canonical/robots).
# Not baked into the bundle at runtime — only used at build time by
# scripts/prerender-products.mjs. Defaults true for deterministic builds.
ARG SITE_ORIGIN
ARG RUN_PRERENDER=true

# Fail fast instead of producing a broken bundle with empty Supabase config.
RUN test -n "$VITE_SUPABASE_URL" -a -n "$VITE_SUPABASE_PUBLISHABLE_KEY" \
    || (echo "ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required build args" && exit 1)

# Dependencies first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Application source + config.
COPY . .

# Production build (vite build → dist/). Never `npm run dev`.
# VITE_* values are injected as shell env only for this command (the anon
# publishable key is public by design — same value shipped in every web
# bundle today). No ENV layer, no files written into the image.
RUN VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT \
    npm run build

# Deterministic prerender (default ON for production images):
#   * dist/prerendered/produit/<slug>/index.html
#   * dist/sitemap.xml
#   * dist/robots.txt (Sitemap: <SITE_ORIGIN>/sitemap.xml)
# Queries the PUBLIC Supabase catalog at build time (accepted for
# production). SITE_ORIGIN is mandatory here — never a hardcoded fake
# domain. Set RUN_PRERENDER=false only for cache-only CI/test images.
RUN if [ "$RUN_PRERENDER" = "true" ]; then \
      if [ -z "$SITE_ORIGIN" ]; then \
        echo "ERROR: SITE_ORIGIN is required when RUN_PRERENDER=true (sitemap/canonical/robots need the production origin)"; \
        exit 1; \
      fi; \
      VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
      VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
      SITE_ORIGIN=$SITE_ORIGIN \
      npm run prerender; \
    fi

# ---------------- Stage 2: runtime ----------------
FROM nginx:1.27-alpine AS runtime

# Nginx: bot-aware prerendered product pages, SPA fallback, gzip, cache
# headers, security headers. No proxy, no backend, no Supabase Auth proxying.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.inc /etc/nginx/conf.d/security-headers.inc

# Copy ONLY the production build output (SPA + sitemap + robots + prerendered/).
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Run nginx in the foreground so Docker keeps the container alive.
CMD ["nginx", "-g", "daemon off;"]
