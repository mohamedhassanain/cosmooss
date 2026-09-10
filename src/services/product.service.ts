/**
 * Couche d'accès aux données produits (Supabase).
 * Les hooks React Query consomment ces fonctions — aucune logique Supabase dans les composants.
 */
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { Product, ProductImage } from '@/types/product';
import { slugify } from '@/lib/utils';

export interface ProductFormData {
  name: string;
  slug: string;
  description?: string;
  price: number;
  original_price?: number;
  is_promotion?: boolean;
  is_featured?: boolean;
  is_active?: boolean;
  image_url?: string;
  image_url_400?: string | null;
  image_url_800?: string | null;
  images?: string[];
  video_url?: string;
  category_id?: string;
  subcategory_id?: string;
  stock_quantity?: number;
  weight_grams?: number;
  brand?: string;
  location_city?: string;
  location_url?: string;
  show_location?: boolean;
}

export interface ProductFilters {
  search?: string;
  category_slug?: string | null;
  subcategory_slug?: string | null;
  /** Résolu côté client (cache catégories) — évite la requête slug→id serveur. */
  category_id?: string | null;
  /** Résolu côté client (cache sous-catégories) — évite la requête slug→id serveur. */
  subcategory_id?: string | null;
  promo?: boolean;
  featured?: boolean;
  sort?: 'newest' | 'price-asc' | 'price-desc';
  page?: number;
  pageSize?: number;
}

export interface PublicProductsResult {
  products: Product[];
  /** Vrai si une page suivante existe (détecté via limit = pageSize + 1). */
  hasNextPage: boolean;
  page: number;
}

/** Limite haute de pageSize pour protéger l'API d'un paramètre abusif. */
export const MAX_PAGE_SIZE = 100;

/**
 * Nettoie un terme de recherche avant insertion dans un filtre PostgREST `.or()`.
 *
 * La syntaxe `.or()` utilise `,` pour séparer les conditions, `()` pour les groupes
 * logiques, `*` et `%` pour les wildcards, `"` pour les valeurs littérales.
 * Ces caractères sont neutralisés (remplacés par un espace) pour empêcher toute
 * tentative d'injection de filtre, ex: `a,is_active.eq.false` ou `x)or(is_active.eq.true`.
 *
 * @returns Le terme nettoyé, sans caractères spéciaux PostgREST, au plus 80 caractères.
 */
export function sanitizeSearchTerm(term: string): string {
  return term
    // Le point est aussi un séparateur de syntaxe PostgREST (colonne.opérateur.valeur).
    .replace(/[.,()%*"=<>;']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

const PRODUCT_SELECT_ADMIN = `
  id, name, slug, description, ingredients, how_to_use,
  price, original_price, is_promotion, is_featured, is_active,
  image_url, image_url_400, image_url_800, video_url, category_id, subcategory_id,
  stock_quantity, weight_grams, brand,
  location_city, location_url, show_location,
  created_at, updated_at,
  categories(name, slug),
  subcategories(name),
  product_images(id, url, sort_order)
`;

const PRODUCT_SELECT_PUBLIC = `
  id, name, slug, price, original_price,
  is_promotion, is_featured, image_url, image_url_400, image_url_800, brand,
  category_id, subcategory_id,
  categories(name, slug)
`;

/**
 * Fiche produit PUBLIQUE : uniquement les champs rendus par la page publique.
 * (Avant : l'admin select complet + jointures product_images/subcategories inutilisées.)
 */
const PRODUCT_SELECT_PUBLIC_DETAIL = `
  id, name, slug, description, ingredients, how_to_use,
  price, original_price, is_promotion, is_featured,
  image_url, image_url_800, video_url, category_id, subcategory_id,
  stock_quantity, weight_grams, brand,
  location_city, location_url, show_location,
  categories(name, slug)
`;

export interface AdminProductFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminProductsResult {
  products: Product[];
  total: number;
  totalPages: number;
  page: number;
}

export async function fetchAllProducts(filters: AdminProductFilters = {}): Promise<AdminProductsResult> {
  const {
    search = '',
    page = 1,
    pageSize = 20,
  } = filters;

  const safePageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);

  let query = supabase
    .from('products')
    .select(PRODUCT_SELECT_ADMIN, { count: 'exact' })
    .order('created_at', { ascending: false });

  const term = sanitizeSearchTerm(search);
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,` +
      `brand.ilike.%${term}%`
    );
  }

  const from = (page - 1) * safePageSize;
  query = query.range(from, from + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    products: (data || []) as unknown as Product[],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / safePageSize),
    page,
  };
}

/**
 * Produits actifs limités (page d'accueil) — évite de charger tout le catalogue.
 *
 * 24 produits : la page d'accueil affiche uniquement des carrousels horizontaux
 * (Recommandé, Promotions, sections par catégorie) filtrés depuis ce lot — aucun
 * total ni pagination n'est affiché. 24 couvrent largement le premier écran de
 * chaque carrousel et réduisent le payload initial (~60%). Les sections « voir
 * tout » redirigent vers /produits qui charge le catalogue paginé à la demande.
 */
export async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT_PUBLIC)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(24);

  if (error) throw error;
  return (data || []) as unknown as Product[];
}

export async function fetchPublicProducts(filters: ProductFilters = {}): Promise<PublicProductsResult> {
  const {
    search = '',
    category_slug = null,
    subcategory_slug = null,
    category_id: providedCategoryId = null,
    subcategory_id: providedSubcategoryId = null,
    promo = false,
    featured: featuredFilter = false,
    sort = 'newest',
    page = 1,
    pageSize = 16,
  } = filters;

  // pageSize est borné [1, MAX_PAGE_SIZE] : impossible de demander un volume abusif.
  const safePageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  // Page bornée ≥ 1 : un paramètre URL abusif ne peut pas provoquer d'offset négatif.
  const safePage = Math.max(1, Math.floor(page));

  // Résolution slug → id. La voie normale est le cache client (ids fournis par le
  // composant) ; le fallback serveur ci-dessous n'est utilisé que si l'id manque
  // (lien direct/partage sans catégories encore en cache) — au prix de 1 requête.
  let categoryId = providedCategoryId;
  if (!categoryId && category_slug) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', category_slug)
      .maybeSingle();
    categoryId = cat?.id || null;
  }

  let subcategoryId = providedSubcategoryId;
  if (!subcategoryId && subcategory_slug && categoryId) {
    // Résolution fiable par slug exact (accents/casse normalisés), sans ILIKE.
    const { data: sub } = await supabase
      .from('subcategories')
      .select('id')
      .eq('category_id', categoryId)
      .eq('slug', slugify(subcategory_slug))
      .maybeSingle();
    subcategoryId = sub?.id ?? null;
  }

  // PAS de count=exact : « Y a-t-il une page suivante ? » est détecté en demandant
  // safePageSize + 1 lignes. Si l'API renvoie plus de safePageSize lignes, une page
  // suivante existe — on n'affiche que les safePageSize premières. Le COUNT(*) exact
  // sur l'ensemble filtré (coûteux à forte charge) est ainsi éliminé ; le total exact
  // « X produit(s) » n'est plus affiché (voir PERFORMANCE_AUDIT.md, phase 3).
  let query = supabase
    .from('products')
    .select(PRODUCT_SELECT_PUBLIC)
    .eq('is_active', true);

  if (categoryId) query = query.eq('category_id', categoryId);
  if (subcategoryId) query = query.eq('subcategory_id', subcategoryId);
  if (promo) query = query.eq('is_promotion', true);
  if (featuredFilter) query = query.eq('is_featured', true);

  // Le terme est sanitizé avant d'entrer dans le filtre `.or()` PostgREST :
  // toute tentative d'injection de condition supplémentaire est neutralisée.
  const term = sanitizeSearchTerm(search);
  if (term) {
    query = query.or(
      `search_vector.phfts.${term},` +
      `name.ilike.%${term}%,` +
      `brand.ilike.%${term}%`
    );
  }

  if (sort === 'price-asc') query = query.order('price', { ascending: true });
  else if (sort === 'price-desc') query = query.order('price', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const from = (safePage - 1) * safePageSize;
  query = query.range(from, from + safePageSize); // +1 ligne pour détecter hasNextPage

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as unknown as Product[];
  const hasNextPage = rows.length > safePageSize;
  return {
    products: rows.slice(0, safePageSize),
    hasNextPage,
    page: safePage,
  };
}

/**
 * Fiche produit publique par slug.
 * `maybeSingle()` : un produit inconnu/inactif retourne `null` (et NON une
 * erreur PGRST116) — la page affiche alors un vrai 404 `noindex` au lieu
 * d'un soft-404 indexable. Les vraies erreurs (réseau, serveur) continuent
 * de remonter pour être gérées par React Query.
 */
export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT_PUBLIC_DETAIL)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as Product) ?? null;
}

async function replaceProductImages(productId: string, images: string[]): Promise<void> {
  await supabase.from('product_images').delete().eq('product_id', productId);
  if (images.length === 0) return;

  const imageRows: Pick<ProductImage, 'product_id' | 'url' | 'sort_order'>[] = images.map((url, idx) => ({
    product_id: productId,
    url,
    sort_order: idx,
  }));
  const { error } = await supabase.from('product_images').insert(imageRows as never);
  if (error) {
    // Échec non bloquant : le produit est créé, seules les images secondaires manquent.
    console.error('Failed to sync product images:', error);
  }
}

export async function createProduct(formData: ProductFormData): Promise<unknown> {
  const { images, ...productData } = formData;
  const { data, error } = await supabase
    .from('products')
    .insert({
      name: productData.name,
      slug: productData.slug,
      description: productData.description || null,
      price: productData.price,
      original_price: productData.original_price || null,
      is_promotion: productData.is_promotion || false,
      is_featured: productData.is_featured || false,
      is_active: productData.is_active ?? true,
      image_url: productData.image_url || null,
      image_url_400: productData.image_url_400 ?? null,
      image_url_800: productData.image_url_800 ?? null,
      video_url: productData.video_url || null,
      category_id: productData.category_id || null,
      subcategory_id: productData.subcategory_id || null,
      stock_quantity: productData.stock_quantity ?? 0,
      weight_grams: productData.weight_grams || null,
      brand: productData.brand || null,
      location_city: productData.location_city || null,
      location_url: productData.location_url || null,
      show_location: productData.show_location ?? false,
    })
    .select()
    .single();

  if (error) throw error;

  const newProduct = data as { id: string } | null;
  if (images && images.length > 0 && newProduct) {
    await replaceProductImages(newProduct.id, images);
  }

  return data;
}

export async function updateProduct(id: string, formData: Partial<ProductFormData>): Promise<unknown> {
  const { images, ...productData } = formData;
  const updateData: TablesUpdate<'products'> = {};
  if (productData.name !== undefined) updateData.name = productData.name;
  if (productData.slug !== undefined) updateData.slug = productData.slug;
  if (productData.description !== undefined) updateData.description = productData.description || null;
  if (productData.price !== undefined) updateData.price = productData.price;
  if (productData.original_price !== undefined) updateData.original_price = productData.original_price || null;
  if (productData.is_promotion !== undefined) updateData.is_promotion = productData.is_promotion;
  if (productData.is_featured !== undefined) updateData.is_featured = productData.is_featured;
  if (productData.is_active !== undefined) updateData.is_active = productData.is_active;
  if (productData.image_url !== undefined) updateData.image_url = productData.image_url || null;
  if (productData.image_url_400 !== undefined) updateData.image_url_400 = productData.image_url_400;
  if (productData.image_url_800 !== undefined) updateData.image_url_800 = productData.image_url_800;
  if (productData.video_url !== undefined) updateData.video_url = productData.video_url || null;
  if (productData.category_id !== undefined) updateData.category_id = productData.category_id || null;
  if (productData.subcategory_id !== undefined) updateData.subcategory_id = productData.subcategory_id || null;
  if (productData.stock_quantity !== undefined) updateData.stock_quantity = productData.stock_quantity;
  if (productData.weight_grams !== undefined) updateData.weight_grams = productData.weight_grams || null;
  if (productData.brand !== undefined) updateData.brand = productData.brand || null;
  if (productData.location_city !== undefined) updateData.location_city = productData.location_city || null;
  if (productData.location_url !== undefined) updateData.location_url = productData.location_url || null;
  if (productData.show_location !== undefined) updateData.show_location = productData.show_location;

  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  if (images) {
    await replaceProductImages(id, images);
  }

  return data;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
