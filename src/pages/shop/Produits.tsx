import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePublicProducts, ProductFilters } from '@/hooks/useProducts';
import { useCategories, useAllSubcategories } from '@/hooks/useCategories';
import { slugify } from '@/lib/utils';
import { useProductActions } from '@/hooks/useProductActions';
import { useSeo } from '@/hooks/useSeo';
import { ProductCard } from '@/components/product/ProductCard';
import { QuickViewDialog } from '@/components/product/QuickViewDialog';
import { ShareDialog } from '@/components/product/ShareDialog';
import { CategoryMegaMenu } from '@/components/navigation/CategoryMegaMenu';
import { CartSheet } from '@/components/cart/CartSheet';
import Logo from '@/components/layout/Logo';
import { Footer } from '@/components/layout/Footer';
import { Product } from '@/types/product';
import { Search, SlidersHorizontal, X, Flower2, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Produits() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories, isLoading: categoriesLoading } = useCategories();
  // Toutes les sous-catégories (cache partagé footer/menu) : permet de résoudre
  // slug → id côté client et d'éviter 2 requêtes Supabase par page filtrée.
  const { subcategories: allSubcategories, isLoading: subcategoriesLoading } = useAllSubcategories();
  const { getShareData } = useProductActions();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(searchParams.get('categorie') || null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(searchParams.get('sous-categorie') || null);
  const [selectedPromo, setSelectedPromo] = useState(searchParams.get('promotions') === 'true');
  const [selectedFeatured, setSelectedFeatured] = useState(searchParams.get('featured') === 'true');
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc'>('newest');
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareData, setShareData] = useState({ url: '', title: '' });

  // Debounce (300 ms) : la recherche publique ne déclenche plus un appel Supabase
  // à chaque frappe clavier, seulement après une pause de saisie.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Résolution slug → id côté client (cache catégories/sous-catégories déjà
  // chargés par le menu/footer) : la requête produits n'a plus besoin des
  // 2 appels serveur slug→id. Les slugs restent dans les filtres pour la
  // stabilité des clés de cache ; les ids sont passés séparément.
  const category = categories.find(c => c.slug === selectedCategory);
  const subcategory = allSubcategories.find(
    s => s.slug === (selectedSubcategory ? slugify(selectedSubcategory) : '')
  );

  // On temporise la requête produits tant que le cache n'a pas permis de
  // résoudre les slugs : on évite la résolution serveur (fallback) puis une
  // seconde requête quand le cache arrive.
  //   * selectedCategory absent             → prêt
  //   * catégorie trouvée dans le cache     → prêt (id fourni, pas de lookup)
  //   * cache encore en chargement          → on attend (pas de requête dupliquée)
  //   * cache chargé ET slug introuvable    → prêt (résultat vide attendu, ou
  //     fallback serveur inoffensif pour un lien direct mal formé)
  const categoryReady = !selectedCategory || !!category || !categoriesLoading;
  const subcategoryReady = !selectedSubcategory || !!subcategory || !subcategoriesLoading;
  const filtersReadyToFetch = categoryReady && subcategoryReady;

  const filters: ProductFilters = {
    search: debouncedSearch,
    category_slug: selectedCategory,
    subcategory_slug: selectedSubcategory,
    category_id: category?.id ?? null,
    subcategory_id: subcategory?.id ?? null,
    promo: selectedPromo,
    featured: selectedFeatured,
    sort: sortBy,
    page,
    pageSize: 16,
  };

  const { products, hasNextPage, currentPage, isLoading } = usePublicProducts(filters, filtersReadyToFetch);

  // --- SEO catalogue ---
  // Seule la page « catégorie » est indexée (URL propre ?categorie=…). Les
  // combinaisons recherche / tri / sous-catégorie / promo / featured / page
  // sont noindex (canonical vers la vue la plus proche) pour éviter d'indexer
  // des variations sans stratégie SEO dédiée.
  const searchActive = debouncedSearch.trim().length > 0;
  const isFilteredUrl = searchActive || !!selectedSubcategory || selectedPromo || selectedFeatured || page > 1;
  const categoryPagePath = selectedCategory ? `/produits?categorie=${selectedCategory}` : '/produits';
  const canonicalPath = isFilteredUrl ? (selectedCategory ? categoryPagePath : '/produits') : categoryPagePath;
  const categoryForSeo = selectedCategory ? category : null;

  useSeo({
    title: categoryForSeo
      ? `${categoryForSeo.name} — Produits cosmétiques au Maroc`
      : 'Produits cosmétiques au Maroc',
    description: categoryForSeo?.description
      ? `${categoryForSeo.description} Achetez en ligne chez Cosmooss au Maroc.`
      : 'Tous nos produits cosmétiques naturels et bio : soins visage, corps, cheveux, maquillage et parfums. Achetez en ligne au Maroc.',
    path: canonicalPath,
    index: !isFilteredUrl,
  });

  useEffect(() => {
    const cat = searchParams.get('categorie');
    setSelectedCategory(cat);
    setSelectedPromo(searchParams.get('promotions') === 'true');
    setSelectedFeatured(searchParams.get('featured') === 'true');
    setSelectedSubcategory(searchParams.get('sous-categorie') || null);
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCategory, selectedSubcategory, selectedPromo, selectedFeatured, sortBy]);

  const handleShare = (product: Product) => {
    setShareData(getShareData(product));
    setIsShareDialogOpen(true);
  };

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSelectedPromo(false);
    setSelectedFeatured(false);
    setSearch('');
    setSearchParams({});
  };

  const hasFilters = selectedCategory || selectedSubcategory || selectedPromo || selectedFeatured;

  return (
    <div className="min-h-screen bg-[#fef8fa]">
      <header className="border-b border-pink-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <Logo className="h-8 w-8" />
            <span className="font-display font-bold text-lg text-pink-700 hidden sm:block">Cosmooss</span>
          </Link>
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-300" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10 bg-pink-50/50 border-pink-100 rounded-full h-10" />
          </div>
        </div>
      </header>

      <CategoryMegaMenu />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            {/* H1 sémantique : nom réel de la catégorie quand elle est active,
                sinon titre générique du catalogue. */}
            <h1 className="text-3xl font-display font-bold text-pink-900">
              {categoryForSeo ? categoryForSeo.name : selectedPromo ? 'Promotions' : selectedFeatured ? 'Recommandé' : 'Nos Produits'}
            </h1>
            {/* Le total exact a été remplacé par le nombre de produits affichés :
                la pagination « page suivante » n'exige plus de COUNT(*) exact
                coûteux (voir PERFORMANCE_AUDIT.md, phase 3). */}
            <p className="text-pink-600">{isLoading ? 'Chargement…' : `${products.length} produit(s) affiché(s)`}</p>
            {/* Description de catégorie : uniquement si une vraie description
                existe en base (le champ description est renseignable dans l'admin
                Catégories). Jamais de texte générique inventé. */}
            {categoryForSeo?.description && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pink-700/80">{categoryForSeo.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Select value={sortBy} onValueChange={(v: 'newest' | 'price-asc' | 'price-desc') => setSortBy(v)}>
              <SelectTrigger className="w-[160px] bg-white border-pink-200">
                <SlidersHorizontal className="h-4 w-4 mr-2 text-pink-400" />
                <SelectValue placeholder="Trier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Nouveautés</SelectItem>
                <SelectItem value="price-asc">Prix croissant</SelectItem>
                <SelectItem value="price-desc">Prix décroissant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={clearFilters} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${!hasFilters && !search ? 'bg-pink-300 text-white' : 'bg-white text-pink-600 border border-pink-200 hover:bg-pink-50'}`}>
            Tous
          </button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => { setSelectedCategory(cat.slug === selectedCategory ? null : cat.slug); setSelectedSubcategory(null); setSearchParams({ categorie: cat.slug === selectedCategory ? '' : cat.slug }); setPage(1); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${selectedCategory === cat.slug ? 'bg-pink-300 text-white' : 'bg-white text-pink-600 border border-pink-200 hover:bg-pink-50'}`}>
              {cat.name}
            </button>
          ))}
          <button onClick={() => { setSelectedPromo(!selectedPromo); setSearchParams({ promotions: !selectedPromo ? 'true' : '' }); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedPromo ? 'bg-red-200 text-red-700' : 'bg-white text-pink-600 border border-pink-200 hover:bg-pink-50'}`}>
            🔥 Promos
          </button>
          <button onClick={() => { setSelectedFeatured(!selectedFeatured); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedFeatured ? 'bg-green-200 text-green-700' : 'bg-white text-pink-600 border border-pink-200 hover:bg-pink-50'}`}>
            Recommandé
          </button>
        </div>

        {/* Active filters */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedCategory && (
              <Badge variant="secondary" className="bg-pink-100 text-pink-700 capitalize">
                {categories.find(c => c.slug === selectedCategory)?.name}
                <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); setSearchParams({}); }} />
              </Badge>
            )}
            <button onClick={clearFilters} className="text-xs text-pink-500 hover:underline">Réinitialiser</button>
          </div>
        )}

        {/* Products grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* Pagination — prev/next basée sur hasNextPage (détecté via limit+1,
            sans COUNT(*) exact) */}
        {(hasNextPage || currentPage > 1) && (
          <div className="flex items-center justify-center gap-4 mt-12">
            <Button
              variant="outline"
              size="icon"
              className="border-pink-200 text-pink-600"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-pink-600 font-medium">
              Page {currentPage}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="border-pink-200 text-pink-600"
              disabled={!hasNextPage}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!isLoading && products.length === 0 && (
          <div className="text-center py-20">
            <Flower2 className="h-12 w-12 text-pink-300 mx-auto mb-4" />
            <p className="text-pink-600">Aucun produit trouvé</p>
          </div>
        )}
      </main>

      <QuickViewDialog product={selectedProduct} isOpen={!!selectedProduct} onOpenChange={(o) => !o && setSelectedProduct(null)} onShare={handleShare} />
      <div className="fixed bottom-20 md:bottom-6 right-6 z-50"><CartSheet /></div>
      <ShareDialog isOpen={isShareDialogOpen} onOpenChange={setIsShareDialogOpen} url={shareData.url} title={shareData.title} />
      <Footer />
    </div>
  );
}
