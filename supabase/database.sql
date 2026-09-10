-- =====================================================
-- COSMOOSS — Schéma complet
-- Exécuter ce fichier dans l'éditeur SQL Supabase.
-- TOUT le fichier est idempotent (rejouable sans erreur) :
--   * tables : CREATE TABLE IF NOT EXISTS
--   * triggers / policies : DROP IF EXISTS + CREATE
--   * un seul bloc DO $$ (vérifie l'existence de l'ancienne table profiles
--     avant suppression, pour être rejouable même quand elle est déjà absente)
-- =====================================================

-- =====================================================
-- EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Nécessaire pour normaliser les accents lors du backfill des slugs de sous-catégories.
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ═══════════════════════════════════════════════════════════════
-- MIGRATION : SUPPRESSION DÉFINITIVE DE L'ANCIENNE TABLE PROFILES
-- Modèle d'accès actuel (voir section « ADMIN AUTHORIZATION ») :
--   tout compte Supabase Auth créé manuellement dans le Dashboard
--   (Authentication → Users) est un compte admin.
-- Toute trace de l'ancien système de profils (table, RPC, trigger)
-- est supprimée ici — y compris sur les bases déjà déployées.
-- ═══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.is_admin_user();

-- Suppression sûre de l'ancien trigger : si la relation profiles n'existe
-- pas (déjà supprimée), DROP TRIGGER lèverait une erreur 42P01. On vérifie
-- d'abord l'existence de la table dans le catalogue système.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
    DROP TABLE IF EXISTS public.profiles;
  END IF;
END $$;

-- =====================================================
-- SCRIPT UNIQUE : CRÉATION DE TOUTES LES TABLES
-- =====================================================
-- Ce bloc est le code unique à exécuter pour créer les tables principales
-- du schéma. Il est idempotent : les tables déjà présentes ne sont pas recréées.
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  ingredients TEXT,
  how_to_use TEXT,
  price NUMERIC NOT NULL,
  original_price NUMERIC,
  is_promotion BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  image_url_400 TEXT,
  image_url_800 TEXT,
  video_url TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id UUID REFERENCES public.subcategories(id) ON DELETE SET NULL,
  stock_quantity INTEGER DEFAULT 0,
  weight_grams NUMERIC,
  brand TEXT,
  location_city TEXT,
  location_url TEXT,
  show_location BOOLEAN DEFAULT FALSE,
  search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('french',
        coalesce(name, '') || ' ' ||
        coalesce(brand, '') || ' ' ||
        coalesce(description, '')
      )
    ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ⚠️ SYNCHRONISATION DES BASES DÉJÀ DÉPLOYÉES (idempotent) :
-- `CREATE TABLE IF NOT EXISTS` n'ajoute JAMAIS de colonne à une table existante.
-- Sur les bases créées avant l'introduction des variantes responsive, ces
-- colonnes manquent → PostgREST renvoie une erreur 400
-- (« column products.image_url_400 does not exist ») sur les requêtes admin
-- (liste, création, édition d'un produit). On les ajoute donc ici pour que
-- rejouer database.sql répare les déploiements existants sans perte de données.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url_400 TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url_800 TEXT;

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_city TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_price NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL DEFAULT 'Cosmooss',
  site_description TEXT,
  whatsapp_number TEXT,
  phone_number TEXT,
  email TEXT,
  address TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  free_shipping_min NUMERIC,
  promo_enabled BOOLEAN NOT NULL DEFAULT true,
  promo_badge TEXT,
  promo_title TEXT,
  promo_subtitle TEXT,
  promo_link TEXT,
  promo_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  link TEXT NOT NULL DEFAULT '/produits?promotions=true',
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- RATE LIMITING SERVEUR (écritures publiques protégées)
-- SCRIPT UNIQUE : ce fichier est l'UNIQUE code SQL du projet
-- (pas de dossier migrations séparé).
-- =====================================================
-- État PERSISTANT partagé entre les instances des Edge Functions
-- `create-order` / `create-contact`. Jamais de Map en mémoire côté
-- runtime serveur (instances éphémères / scale horizontal).
-- Un compteur par (bucket_key, fenêtre fixe) — upsert atomique via
-- `bump_rate_limit()`, exécutable UNIQUEMENT par service_role.
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket_key   TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 1,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rate_limit_counters_pkey PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_updated_at
  ON public.rate_limit_counters (updated_at);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_rate_limit(
  p_bucket_key   TEXT,
  p_window_start TIMESTAMPTZ,
  p_max_count    INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limit_counters (bucket_key, window_start, count, updated_at)
  VALUES (p_bucket_key, p_window_start, 1, now())
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET
    count      = public.rate_limit_counters.count + 1,
    updated_at = now()
  RETURNING count INTO v_count;

  IF v_count > p_max_count THEN
    DELETE FROM public.rate_limit_counters
    WHERE bucket_key = p_bucket_key
      AND updated_at < now() - interval '2 hours';
  END IF;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.bump_rate_limit(TEXT, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_rate_limit(TEXT, TIMESTAMPTZ, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.bump_rate_limit(TEXT, TIMESTAMPTZ, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(TEXT, TIMESTAMPTZ, INTEGER) TO service_role;

-- Nettoyage global des compteurs expirés (appelé de façon probabiliste
-- par l'Edge Function). Exécutable uniquement par service_role.
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_counters(p_cutoff TIMESTAMPTZ)
RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM public.rate_limit_counters WHERE updated_at < p_cutoff;
$$;

REVOKE ALL ON FUNCTION public.cleanup_rate_limit_counters(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_rate_limit_counters(TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_rate_limit_counters(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_counters(TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- ADMIN ALLOWLIST — is_admin() explicite
--
-- `is_admin()` = auth.uid() ∈ admin_users. Plus JAMAIS
-- « auth.uid() IS NOT NULL » (trop large : tout compte de la base
-- Auth devenait admin). RLS activée + aucune policy → anon et
-- authenticated ne peuvent ni lire ni écrire la table. Seul
-- service_role (SQL Editor / Edge Functions) la gère.
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_users FROM anon;
REVOKE ALL ON TABLE public.admin_users FROM authenticated;

-- Seed NON blindé : au premier déploiement uniquement (table vide),
-- tous les comptes Auth existants deviennent admins → aucun
-- verrouillage accidentel des comptes en place.
INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM public.admin_users);

-- ═══════════════════════════════════════════════════════════════
-- ADMIN AUTHORIZATION — MODÈLE ACTUEL (allowlist explicite)
--
-- Ce projet Supabase Auth reste réservé EXCLUSIVEMENT aux comptes
-- administrateurs. Aucune inscription publique (aucune page /signup,
-- aucun appel signUp()). Les comptes sont créés manuellement par le
-- propriétaire : Dashboard → Authentication → Users → Create user.
--
--   Utilisateur authentifié ET présent dans admin_users → ADMIN
--   Tout autre cas (anonyme, ou authentifié non allowlisté)  → PAS ADMIN
--
-- `is_admin()` = auth.uid() ∈ admin_users (SECURITY DEFINER, lue par
-- les policies RLS et par le guard frontend RequireAdmin). La table
-- admin_users est protégée : RLS activée, aucune policy, accès anon/
-- authenticated révoqués → seuls le SQL Editor (service_role) et les
-- Edge Functions peuvent gérer l'allowlist.
--
-- Protection en profondeur : même si un compte non-admin était créé
-- dans la base Auth, il ne pourrait RIEN lire/écrire de sensible.
--

-- Allowlist explicite : auth.uid() doit exister dans public.admin_users.
-- SECURITY DEFINER pour lire admin_users malgre son RLS; auth.uid()
-- reste derive du JWT appelant.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  );
$$;

-- Exécutable par le client (RPC) pour le guard frontend RequireAdmin,
-- et par les policies RLS ci-dessous. REVOKE préalable indispensable :
-- sans lui, le privilège PUBLIC hérité d'anciennes versions resterait
-- (la fonction est appelable par le rôle `public` par défaut).
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ⚠️ MIGRATION DES DONNÉES EXISTANTES (slug) :
-- Génère les slugs des sous-catégories déjà en base (une seule fois).
UPDATE public.subcategories
SET slug = lower(regexp_replace(
  regexp_replace(unaccent(name), '[^a-zA-Z0-9]+', '-', 'g'),
  '(^-)|(-$)', '', 'g'
))
WHERE slug IS NULL
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent');

UPDATE public.subcategories
SET slug = lower(regexp_replace(
  regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'),
  '(^-)|(-$)', '', 'g'
))
WHERE slug IS NULL;

-- Contrainte d'unicité par catégorie, une fois les données backfillées.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subcategories_category_slug
  ON public.subcategories (category_id, slug);

-- Index plein-texte pour la recherche côté serveur
CREATE INDEX IF NOT EXISTS idx_products_search_vector
  ON public.products USING GIN (search_vector);

-- Index pour pagination (tri par date)
CREATE INDEX IF NOT EXISTS idx_products_created_at
  ON public.products (created_at DESC);

-- Index pour les filtres courants
CREATE INDEX IF NOT EXISTS idx_products_category
  ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory
  ON public.products (subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_active
  ON public.products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_promotion
  ON public.products (is_promotion) WHERE is_promotion = true;
CREATE INDEX IF NOT EXISTS idx_products_featured
  ON public.products (is_featured) WHERE is_featured = true;

-- Extension pour recherche approximative performante (ilike avec wildcard en début de motif).
-- Sans cet index, un filtre `name.ilike.%terme%` déclenche un scan séquentiel car le B-tree
-- classique ne peut pas exploiter un wildcard en tête. Les index GIN trigram permettent au
-- planificateur de requête de filtrer efficacement même avec `%...%`.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING gin (brand gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
  ON public.product_images (product_id, sort_order);

-- Index pour la pagination admin des commandes (tri par date décroissante)
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at DESC);

-- Index pour le comptage/dashboard des commandes en attente
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);

-- Index pour le tri admin des messages de contact
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at
  ON public.contact_messages (created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- AUDIT DES INDEX (optimisation performance — 12/08/2026)
--
-- Les index ci-dessus couvrent DÉJÀ toutes les requêtes optimisées
-- côté frontend (catalog, catégorie, sous-catégorie, détail, recherche) :
--
--   * products.slug UNIQUE                       → détail produit par slug
--   * idx_products_search_vector GIN             → recherche plein-texte
--   * idx_products_name_trgm / brand_trgm GIN    → recherche ilike %..%
--   * idx_products_created_at DESC               → tri/pagination récent
--   * idx_products_category / subcategory / active / promotion / featured
--   * idx_subcategories_category_slug UNIQUE     → sous-catégories par catégorie
--   * idx_orders_created_at + status_created     → pagination/dashboard admin
--   * idx_contact_messages_created_at            → tri admin
--
-- Conclusion de l'audit : AUCUN index supplémentaire n'est requis pour
-- la taille actuelle du catalogue. Deux index composites ne deviendraient
-- utiles qu'à grande échelle (plusieurs milliers de produits) :
--
--   CREATE INDEX CONCURRENTLY idx_products_category_active_created
--     ON public.products (category_id, is_active, created_at DESC)
--     WHERE is_active = true;
--
--   CREATE INDEX CONCURRENTLY idx_products_promo_active_created
--     ON public.products (created_at DESC)
--     WHERE is_active = true AND is_promotion = true;
--
-- ⚠️ NE PAS exécuter ces deux index sans avoir d'abord mesuré avec
--    EXPLAIN ANALYZE sur un volume représentatif : ils ajoutent un coût
--    d'écriture/stockage par ligne.
--
-- NB : count=exact est conservé volontairement (l'UI affiche
-- « X produit(s) » + la pagination) ; le levier d'optimisation est le
-- cache frontend (staleTime/gcTime) + la déduplication des requêtes,
-- déjà appliqués au 12/08/2026.
-- ═══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────
-- CONTRAINTES D'INTÉGRITÉ (idempotent : DROP + ADD)
-- Empêchent des INSERT aberrants via les tables publiques
-- (quantité 0/négative, prix négatif, nom de produit vide).
-- ──────────────────────────────────────────────
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_quantity_positive;
ALTER TABLE public.orders ADD CONSTRAINT orders_quantity_positive CHECK (quantity >= 1);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_total_price_non_negative;
ALTER TABLE public.orders ADD CONSTRAINT orders_total_price_non_negative CHECK (total_price >= 0);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_product_name_not_empty;
ALTER TABLE public.orders ADD CONSTRAINT orders_product_name_not_empty CHECK (char_length(product_name) > 0);

-- =====================================================
-- STORAGE BUCKET
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cosmetics-images', 'cosmetics-images', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA
-- =====================================================
-- site_settings est un singleton fonctionnel : ne le créer que si la table est vide.
-- ON CONFLICT seul ne suffit pas ici car la table ne possède pas de clé unique métier.
INSERT INTO public.site_settings (site_name, whatsapp_number, hero_title, hero_subtitle, promo_enabled, promo_badge, promo_title, promo_subtitle, promo_link)
SELECT 'Cosmooss', '+212600000000', 'Votre Beauté, Notre Passion', 'Découvrez notre sélection de cosmétiques naturels et bio au Maroc', true, 'PROMO DU MOMENT', 'Jusqu''à -50%', 'Sur une sélection de cosmétiques naturels & bio', '/produits?promotions=true'
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings);

-- Migration idempotente : renomme l'ancienne marque sur les bases déjà déployées.
UPDATE public.site_settings
SET site_name = 'Cosmooss'
WHERE site_name = 'Kissariya Cosmétiques';

INSERT INTO public.categories (name, slug, description, sort_order) VALUES
('Soins Visage', 'soins-visage', 'Crèmes, sérums, nettoyants et masques pour le visage', 1),
('Soins Corps', 'soins-corps', 'Hydratants, exfoliants et huiles pour le corps', 2),
('Soins Cheveux', 'soins-cheveux', 'Shampoings, après-shampoings et masques capillaires', 3),
('Maquillage', 'maquillage', 'Fond de teint, rouges à lèvres, fards et plus', 4),
('Parfums', 'parfums', 'Eaux de parfum, eaux de toilette et attars', 5),
('Naturel & Bio', 'naturel-bio', 'Produits naturels, bio et artisanaux', 6),
('Hygiène', 'hygiene', 'Savons, dentifrices et déodorants', 7),
('Accessoires', 'accessoires-beaute', 'Pinceaux, éponges et outils de beauté', 8)
ON CONFLICT DO NOTHING;

-- Évite de recréer la promotion de démonstration à chaque exécution du schéma.
INSERT INTO public.promos (badge, title, subtitle, link, is_active, sort_order)
SELECT
  'PROMO DU MOMENT',
  'Jusqu''à -50%',
  'Sur une sélection de cosmétiques naturels & bio',
  '/produits?promotions=true',
  true,
  0
WHERE NOT EXISTS (SELECT 1 FROM public.promos);

-- =====================================================
-- FONCTIONS
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =====================================================
-- UPDATED_AT TRIGGERS (idempotent : DROP + CREATE)
-- =====================================================
DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_subcategories_updated_at ON public.subcategories;
CREATE TRIGGER trg_subcategories_updated_at BEFORE UPDATE ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_promos_updated_at ON public.promos;
CREATE TRIGGER trg_promos_updated_at BEFORE UPDATE ON public.promos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- RLS POLICIES (idempotent : DROP + CREATE)
-- =====================================================


-- categories
DROP POLICY IF EXISTS "categories_public_select" ON public.categories;
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "categories_admin_manage" ON public.categories;
CREATE POLICY "categories_admin_manage" ON public.categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- subcategories
DROP POLICY IF EXISTS "subcategories_public_select" ON public.subcategories;
CREATE POLICY "subcategories_public_select" ON public.subcategories FOR SELECT USING (true);

DROP POLICY IF EXISTS "subcategories_admin_manage" ON public.subcategories;
CREATE POLICY "subcategories_admin_manage" ON public.subcategories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- products
DROP POLICY IF EXISTS "products_public_select" ON public.products;
CREATE POLICY "products_public_select" ON public.products FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "products_admin_select_all" ON public.products;
CREATE POLICY "products_admin_select_all" ON public.products FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "products_admin_manage" ON public.products;
CREATE POLICY "products_admin_manage" ON public.products FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- product_images
DROP POLICY IF EXISTS "product_images_public_select" ON public.product_images;
-- SELECT public limité aux produits ACTIFS : les images des produits masqués
-- ne sont plus exposées (cohérent avec la policy de lecture des produits).
CREATE POLICY "product_images_public_select" ON public.product_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "product_images_admin_manage" ON public.product_images;
CREATE POLICY "product_images_admin_manage" ON public.product_images FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- orders
-- ⚠️ INSERT public direct SUPPRIMÉ : les commandes des visiteurs (WhatsApp /
--    panier) passent désormais par l'Edge Function `create-order`
--    (service_role, rate-limitée, validée — voir section « RATE LIMITING SERVEUR »
--    ci-dessus, script UNIXE du schéma).
--    Seul l'admin connecté (JWT authentifié) peut insérer directement.
--    SELECT / UPDATE / DELETE restent réservés aux utilisateurs authentifiés.
DROP POLICY IF EXISTS "orders_admin_manage" ON public.orders;

DROP POLICY IF EXISTS "orders_insert_public" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_insert" ON public.orders;
CREATE POLICY "orders_admin_insert" ON public.orders FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
CREATE POLICY "orders_admin_select" ON public.orders FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
CREATE POLICY "orders_admin_update" ON public.orders FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;
CREATE POLICY "orders_admin_delete" ON public.orders FOR DELETE USING (public.is_admin());

-- contact_messages
-- ⚠️ PLUS AUCUNE policy d'INSERT publique : l'unique chemin d'écriture est
--    l'Edge Function `create-contact` (service_role, rate-limitée, validée).
DROP POLICY IF EXISTS "contact_messages_insert_public" ON public.contact_messages;

DROP POLICY IF EXISTS "contact_messages_admin_select" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_select" ON public.contact_messages FOR SELECT USING (public.is_admin());

-- site_settings
DROP POLICY IF EXISTS "site_settings_public_select" ON public.site_settings;
CREATE POLICY "site_settings_public_select" ON public.site_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "site_settings_admin_manage" ON public.site_settings;
CREATE POLICY "site_settings_admin_manage" ON public.site_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- promos
DROP POLICY IF EXISTS "promos_public_select" ON public.promos;
CREATE POLICY "promos_public_select" ON public.promos FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "promos_admin_select_all" ON public.promos;
CREATE POLICY "promos_admin_select_all" ON public.promos FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "promos_admin_manage" ON public.promos;
CREATE POLICY "promos_admin_manage" ON public.promos FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- storage
DROP POLICY IF EXISTS "images_public_select" ON storage.objects;
CREATE POLICY "images_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'cosmetics-images');

DROP POLICY IF EXISTS "images_authenticated_manage" ON storage.objects;
DROP POLICY IF EXISTS "images_admin_manage" ON storage.objects;
CREATE POLICY "images_admin_manage" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'cosmetics-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'cosmetics-images' AND public.is_admin());

-- =====================================================
-- REFRESH SCHEMA CACHE
-- =====================================================
NOTIFY pgrst, 'reload schema';
