import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActiveProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductCarousel } from '@/components/product/ProductCarousel';
import { HeroPromoCarousel } from '@/components/shop/HeroPromoCarousel';
import { QuickViewDialog } from '@/components/product/QuickViewDialog';
import { ShareDialog } from '@/components/product/ShareDialog';
import { CartSheet } from '@/components/cart/CartSheet';
import { CategoryMegaMenu } from '@/components/navigation/CategoryMegaMenu';
import Logo from '@/components/layout/Logo';
import { Footer } from '@/components/layout/Footer';
import { useProductActions } from '@/hooks/useProductActions';
import { useSeo } from '@/hooks/useSeo';
import { absoluteUrl, DEFAULT_SITE_NAME } from '@/lib/seo';
import { Product } from '@/types/product';
import { Search, Sparkles, TrendingUp, ChevronRight, Leaf, Flower2, Heart } from 'lucide-react';

export default function Index() {
  const { activeProducts, featuredProducts, promotionProducts, isLoading } = useActiveProducts();
  const { categories } = useCategories();
  const { settings } = useSiteSettings();
  const { getShareData } = useProductActions();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareData, setShareData] = useState({ url: '', title: '' });

  // SEO homepage — données réelles uniquement (aucune adresse/téléphone inventés).
  useSeo({
    title: 'Boutique de cosmétiques naturels et bio au Maroc',
    description:
      'Boutique en ligne de cosmétiques naturels et bio au Maroc. Soins visage, corps, cheveux, maquillage et parfums. Livraison partout au Maroc.',
    path: '/',
    jsonLd: [
      {
        id: 'website',
        data: {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: DEFAULT_SITE_NAME,
          url: absoluteUrl('/'),
          inLanguage: 'fr-MA',
        },
      },
      {
        id: 'organization',
        data: {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: DEFAULT_SITE_NAME,
          url: absoluteUrl('/'),
          logo: absoluteUrl('/favicon-app.svg'),
        },
      },
    ],
  });

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return activeProducts.filter(p => 
      p.name.toLowerCase().includes(query) ||
      (p.brand || '').toLowerCase().includes(query) ||
      (p.categories?.name || '').toLowerCase().includes(query)
    );
  }, [activeProducts, searchQuery]);

  const handleShare = (product: Product) => {
    setShareData(getShareData(product));
    setIsShareDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#fef8fa]">
      {/* Header */}
      <header className="border-b border-pink-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <Logo className="h-8 w-8" />
            <span className="font-display font-bold text-xl text-pink-700 hidden sm:block">
              {settings?.site_name || 'Cosmooss'}
            </span>
          </Link>

          <div className="flex-1 max-w-2xl relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-300 group-focus-within:text-pink-500 transition-colors" />
            <Input 
              placeholder="Rechercher un produit, une marque..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 bg-pink-50/50 border-pink-100 focus-visible:ring-2 focus-visible:ring-pink-300 h-11 rounded-full"
            />
          </div>
        </div>
      </header>

      {/* Mega Menu Catégories */}
      <CategoryMegaMenu />

      {/* Hero Section */}
      {!searchQuery && (
        <section className="relative overflow-hidden bg-gradient-to-br from-pink-100 via-rose-50 to-purple-50">
          <div className="max-w-7xl mx-auto px-4 py-20 md:py-28 relative z-10">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-md rounded-full px-4 py-1.5 mb-6 border border-pink-200">
                <Leaf className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-pink-800">Cosmétiques naturels & bio</span>
              </div>
              <h1 className="font-display text-5xl md:text-7xl font-bold text-pink-900 leading-tight mb-6">
                {settings?.hero_title || 'Votre Beauté, Notre Passion'}
              </h1>
              <p className="text-lg text-pink-700/80 mb-8 leading-relaxed">
                {settings?.hero_subtitle || 'Découvrez notre sélection de cosmétiques naturels et bio au Maroc'}
              </p>
                <div className="flex flex-wrap gap-4">
                  <Button asChild size="lg" className="bg-pink-400 hover:bg-pink-500 text-white rounded-full px-8 h-12 shadow-lg">
                    <Link to="/produits">
                      <Flower2 className="h-5 w-5 mr-2" />
                      Découvrir nos produits
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="border-pink-300 text-pink-700 hover:bg-pink-50 rounded-full px-8 h-12">
                    <Link to="/produits?promotions=true">
                      <Heart className="h-5 w-5 mr-2" />
                      Nos promos
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Carrousel de publicités à droite (desktop) */}
              <HeroPromoCarousel />
            </div>
          </div>
          <div className="absolute -top-20 -right-20 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-purple-200/20 rounded-full blur-3xl" />
        </section>
      )}

      {/* Search Results */}
      {searchQuery && (
        <main className="py-12 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-display font-bold text-pink-900">
                Résultats pour "{searchQuery}"
              </h2>
              <Button variant="ghost" onClick={() => setSearchQuery('')} className="text-pink-500">
                Effacer
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </main>
      )}

      {/* Main Content */}
      {!searchQuery && (
        <main className="py-16 px-4">
          <div className="max-w-7xl mx-auto space-y-20">
            {/* Featured Products */}
            {featuredProducts.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-display font-bold text-pink-900 flex items-center gap-2">
                    <Sparkles className="h-6 w-6 text-pink-400" />
                    Recommandé
                  </h2>
                  <Button variant="ghost" className="text-pink-600" asChild>
                    <Link to="/produits?featured=true">
                      Voir tout <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
                <ProductCarousel products={featuredProducts} />
              </section>
            )}

            {/* Promotions */}
            {promotionProducts.length > 0 && (
              <section className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-3xl p-6 md:p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-display font-bold text-pink-900 flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-red-400" />
                    Promotions du moment
                  </h2>
                  <Button variant="ghost" className="text-pink-600" asChild>
                    <Link to="/produits?promotions=true">
                      Voir tout <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
                <ProductCarousel products={promotionProducts} />
              </section>
            )}

            {/* All Products by Category */}
            {categories.map(cat => {
              const catProducts = activeProducts.filter(p => p.categories?.slug === cat.slug);
              if (catProducts.length === 0) return null;
              return (
                <section key={cat.id}>
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-display font-bold text-pink-900">{cat.name}</h2>
                    <Button variant="ghost" className="text-pink-600" asChild>
                      <Link to={`/produits?categorie=${cat.slug}`}>
                        Voir tout <ChevronRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                  <ProductCarousel products={catProducts} />
                </section>
              );
            })}

            {!isLoading && activeProducts.length === 0 && (
              <div className="text-center py-20">
                <div className="h-20 w-20 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Flower2 className="h-10 w-10 text-pink-300" />
                </div>
                <h2 className="text-xl font-bold text-pink-900 mb-2">Bientôt disponible</h2>
                <p className="text-pink-600">Nos produits cosmétiques arrivent très bientôt. Restez à l'écoute !</p>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Quick View */}
      <QuickViewDialog 
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        onShare={handleShare}
      />

      {/* Floating Cart */}
      <div className="fixed bottom-20 md:bottom-6 right-6 z-50">
        <CartSheet />
      </div>

      <ShareDialog
        isOpen={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
        url={shareData.url}
        title={shareData.title}
      />

      <Footer />
    </div>
  );
}
