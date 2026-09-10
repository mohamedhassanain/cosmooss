import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CartSheet } from '@/components/cart/CartSheet';
import { ShareDialog } from '@/components/product/ShareDialog';
import Logo from '@/components/layout/Logo';
import { Footer } from '@/components/layout/Footer';
import { useProductActions } from '@/hooks/useProductActions';
import { useCart } from '@/providers/cart-utils';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useProductBySlug } from '@/hooks/useProducts';
import { getProductDetailImage } from '@/lib/images';
import { getPromoDisplay } from '@/lib/product-promo';
import { useSeo } from '@/hooks/useSeo';
import { absoluteUrl } from '@/lib/seo';
import { ShoppingCart, MessageCircle, Share2, ChevronLeft, ChevronRight, Sparkles, Leaf, Flower2, Package, Play, MapPin, Navigation, X } from 'lucide-react';

type MediaItem = { type: 'image' | 'video'; url: string };

/**
 * Vue « produit introuvable » — VRAI 404 noindex.
 * Aucun JSON-LD Product/BreadcrumbList, aucune meta produit : un slug
 * inconnu (ou produit inactif) ne doit jamais devenir une page produit
 * indexable (pas de soft-404). Le nettoyage de useSeo retire les éventuels
 * blocs JSON-LD injectés par une fiche précédente.
 */
function ProductNotFound({ slug }: { slug: string | undefined }) {
  useSeo({
    title: 'Produit introuvable',
    description: 'Le produit demandé est introuvable.',
    path: slug ? `/produit/${slug}` : undefined,
    index: false,
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fef8fa]">
      <div className="text-center">
        <Package className="h-16 w-16 mx-auto text-pink-300 mb-4" />
        <h1 className="text-2xl font-bold text-pink-900 mb-2">Produit introuvable</h1>
        <Button asChild className="bg-pink-300 hover:bg-pink-400 rounded-full"><Link to="/produits">Voir tous les produits</Link></Button>
      </div>
    </div>
  );
}

export default function ProduitDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { parseImages, handleWhatsAppOrder, getShareData } = useProductActions();
  const { addToCart } = useCart();
  const { settings } = useSiteSettings();
  const { data: product, isLoading: loading } = useProductBySlug(slug);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareData, setShareData] = useState({ url: '', title: '' });
  const [showNavChoice, setShowNavChoice] = useState(false);

  const getMapsUrl = () => {
    if (!product?.location_url) return '#';
    return product.location_url.includes('goo.gl') || product.location_url.startsWith('https://www.google.com/maps')
      ? product.location_url
      : `https://www.google.com/maps?q=${encodeURIComponent(product.location_url)}`;
  };

  const getWazeUrl = () => {
    if (!product?.location_url) return '#';
    return `https://waze.com/ul?q=${encodeURIComponent(product.location_city || product.location_url)}`;
  };

  const mediaItems: MediaItem[] = useMemo(() => {
    if (!product) return [];
    const items: MediaItem[] = parseImages(product.image_url).map(url => ({ type: 'image', url }));
    if (product.video_url) {
      items.push({ type: 'video', url: product.video_url });
    }
    return items;
  }, [product, parseImages]);

  const currentMedia = mediaItems[mediaIndex];

  // SEO : title, description, canonical, og:type=product, Product + BreadcrumbList
  // JSON-LD — uniquement des données réelles du produit (jamais inventées).
  useSeo({
    title: product ? `Acheter ${product.name} au Maroc` : undefined,
    description: product?.description || undefined,
    image: product ? parseImages(product.image_url)[0] : undefined,
    path: product ? `/produit/${product.slug}` : undefined,
    ogType: 'product',
    jsonLd: product
      ? [
          {
            id: 'product',
            data: {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: product.name,
              description: product.description || undefined,
              image: parseImages(product.image_url)[0] || undefined,
              ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
              offers: {
                '@type': 'Offer',
                price: Number(product.price),
                priceCurrency: 'MAD',
                ...(product.stock_quantity > 0
                  ? { availability: 'https://schema.org/InStock' }
                  : { availability: 'https://schema.org/OutOfStock' }),
              },
            },
          },
          ...(product.categories?.name
            ? [
                {
                  id: 'breadcrumb',
                  data: {
                    '@context': 'https://schema.org',
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                      {
                        '@type': 'ListItem',
                        position: 1,
                        name: 'Accueil',
                        item: absoluteUrl('/'),
                      },
                      {
                        '@type': 'ListItem',
                        position: 2,
                        name: product.categories.name,
                        item: absoluteUrl(`/produits?categorie=${product.categories.slug}`),
                      },
                      {
                        '@type': 'ListItem',
                        position: 3,
                        name: product.name,
                        item: absoluteUrl(`/produit/${product.slug}`),
                      },
                    ],
                  },
                },
              ]
            : []),
        ]
      : undefined,
  });

  const handleShare = () => {
    if (!product) return;
    setShareData(getShareData(product));
    setIsShareDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fef8fa] p-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-32 mb-6" />
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-square rounded-3xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return <ProductNotFound slug={slug} />;
  }

  const promo = getPromoDisplay(product);

  return (
    <div className="min-h-screen bg-[#fef8fa]">
      <header className="border-b border-pink-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <Logo className="h-8 w-8" />
        <span className="font-display font-bold text-lg text-pink-700 hidden sm:block">{settings?.site_name || 'Cosmooss'}</span>
          </Link>
          <Link to="/produits" className="text-pink-500 hover:text-pink-700 text-sm ml-auto">← Tous les produits</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Fil d'Ariane sémantique — liens internes indexables (Accueil → Catégorie → Produit) */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-pink-500">
            <li>
              <Link to="/" className="hover:text-pink-700">Accueil</Link>
            </li>
            {product.categories?.name && (
              <>
                <li aria-hidden="true" className="text-pink-300">›</li>
                <li>
                  <Link
                    to={`/produits?categorie=${product.categories.slug}`}
                    className="hover:text-pink-700"
                  >
                    {product.categories.name}
                  </Link>
                </li>
              </>
            )}
            <li aria-hidden="true" className="text-pink-300">›</li>
            <li aria-current="page" className="text-pink-900 font-medium">{product.name}</li>
          </ol>
        </nav>
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Media Gallery (images + video) */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-white border border-pink-100">
              {currentMedia?.type === 'image' ? (
                // L'image principale est le LCP de la page produit : chargement prioritaire.
                // srcSet/sizes uniquement pour l'image primaire (variante 800px associée).
                (() => {
                  const detailImage = getProductDetailImage(product);
                  const isPrimary = mediaIndex === 0;
                  return (
                    <img
                      src={isPrimary && detailImage.src ? detailImage.src : currentMedia.url}
                      srcSet={isPrimary ? detailImage.srcSet : undefined}
                      sizes={isPrimary ? detailImage.sizes : undefined}
                      alt={product.name}
                      loading="eager"
                      decoding="async"
                      width={800}
                      height={800}
                      className="w-full h-full object-cover"
                    />
                  );
                })()
              ) : currentMedia?.type === 'video' ? (
                currentMedia.url.includes('youtube') || currentMedia.url.includes('youtu.be') ? (
                  <iframe
                    src={(() => {
                      const videoId = currentMedia.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || '';
                      return `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&mute=1&playlist=${videoId}`;
                    })()}
                    className="w-full h-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    title="Product video"
                  />
                ) : (
                  <video src={currentMedia.url} autoPlay loop muted playsInline className="w-full h-full object-contain" />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Package className="h-20 w-20 text-pink-200" /></div>
              )}
              
              {promo && (
                <Badge className="absolute top-4 left-4 bg-red-400 text-white border-none px-3 py-1 shadow-lg">
                  -{promo.percent}%
                </Badge>
              )}
              {product.is_featured && (
                <Badge className="absolute top-4 right-4 bg-green-400 text-white border-none px-3 py-1 shadow-lg">
                  <Sparkles className="h-3 w-3 mr-1" /> Recommandé
                </Badge>
              )}
              {mediaItems.length > 1 && (
                <>
                  <button onClick={() => setMediaIndex(i => i === 0 ? mediaItems.length - 1 : i - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow">
                    <ChevronLeft className="h-5 w-5 text-pink-700" />
                  </button>
                  <button onClick={() => setMediaIndex(i => i === mediaItems.length - 1 ? 0 : i + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow">
                    <ChevronRight className="h-5 w-5 text-pink-700" />
                  </button>
                </>
              )}
            </div>
            {mediaItems.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {mediaItems.map((item, i) => (
                  <button key={i} onClick={() => setMediaIndex(i)} className={`shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition-all ${i === mediaIndex ? 'border-pink-400' : 'border-transparent opacity-60'}`}>
                    {item.type === 'image' ? (
                      <img src={item.url} alt="" loading="lazy" decoding="async" width={64} height={64} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-pink-100 flex items-center justify-center">
                        <Play className="h-6 w-6 text-pink-400" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-6">
            <div>
              {product.categories && (
                <Link to={`/produits?categorie=${product.categories.slug}`} className="text-xs uppercase tracking-wider text-pink-500 hover:text-pink-700 font-bold">
                  {product.categories.name}
                </Link>
              )}
              <h1 className="text-3xl md:text-4xl font-display font-bold text-pink-900 mt-1">{product.name}</h1>
              {product.brand && (
                <div className="flex items-center gap-1 text-sm text-pink-600 mt-1">
                  <Leaf className="h-3 w-3" /> {product.brand}
                </div>
              )}
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-pink-700">{promo ? promo.currentPrice : product.price} DH</span>
              {promo && (
                <span className="text-xl text-pink-300 line-through">{promo.oldPrice} DH</span>
              )}
            </div>

            {product.description && (
              <div>
                <h3 className="font-bold text-pink-900 mb-2">Description</h3>
                <p className="text-pink-700 leading-relaxed whitespace-pre-wrap">{product.description}</p>
              </div>
            )}

            {product.ingredients && (
              <div className="bg-pink-50 rounded-2xl p-4">
                <h3 className="font-bold text-pink-900 mb-1 flex items-center gap-2"><Leaf className="h-4 w-4 text-green-500" /> Ingrédients</h3>
                <p className="text-pink-700 text-sm">{product.ingredients}</p>
              </div>
            )}

            {product.how_to_use && (
              <div>
                <h3 className="font-bold text-pink-900 mb-2">Mode d'emploi</h3>
                <p className="text-pink-700 text-sm whitespace-pre-wrap">{product.how_to_use}</p>
              </div>
            )}

            {product.weight_grams && (
              <p className="text-sm text-pink-500">Poids: {product.weight_grams}g</p>
            )}

            {product.stock_quantity > 0 && (
              <p className="text-sm text-green-600 flex items-center gap-1"><Flower2 className="h-3 w-3" /> En stock ({product.stock_quantity} unités)</p>
            )}

            {/* Localisation */}
            {product.show_location && product.location_url && (
              <div className="bg-pink-50 rounded-2xl p-4 space-y-3">
                <h3 className="font-bold text-pink-900 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-pink-500" />
                  {product.location_city || 'Localisation'}
                </h3>
                <button
                  type="button"
                  className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-pink-100 bg-white group cursor-pointer"
                  onClick={() => setShowNavChoice(true)}
                >
                  <iframe
                    src={`https://www.google.com/maps?q=${encodeURIComponent(product.location_url.replace('https://www.google.com/maps?q=', ''))}&output=embed`}
                    className="w-full h-full pointer-events-none"
                    loading="lazy"
                    title="Carte"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
                    <span className="bg-white/90 text-pink-700 text-xs font-bold px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg">
                      Cliquez pour naviguer
                    </span>
                  </div>
                </button>
              </div>
            )}

            <div className="space-y-3 pt-4 border-t border-pink-100">
              <Button className="w-full bg-pink-400 hover:bg-pink-500 text-white rounded-2xl h-14 text-lg font-bold shadow-lg" onClick={() => { addToCart({ id: product.id, name: product.name, price: product.price, image_url: mediaItems.find(m => m.type === 'image')?.url || null }); }}>
                <ShoppingCart className="h-5 w-5 mr-2" /> Ajouter au panier
              </Button>
              <Button className="w-full bg-green-500 hover:bg-green-600 text-white rounded-2xl h-14 text-lg font-bold shadow-lg" onClick={() => handleWhatsAppOrder(product)}>
                <MessageCircle className="h-5 w-5 mr-2" /> Commander sur WhatsApp
              </Button>
              <Button variant="outline" className="w-full border-pink-200 text-pink-600 hover:bg-pink-50 rounded-2xl h-12" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" /> Partager
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Navigation Choice Dialog */}
      {showNavChoice && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" role="presentation">
          {/* Backdrop cliquable — bouton natif accessible au clavier */}
          <button
            type="button"
            aria-label="Fermer la boîte de navigation"
            onClick={() => setShowNavChoice(false)}
            className="absolute inset-0 bg-black/40 cursor-default"
          />
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-pink-900 text-lg">Naviguer vers</h3>
              <button onClick={() => setShowNavChoice(false)} className="text-pink-400 hover:text-pink-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-pink-600">{product.location_city || 'le point de vente'}</p>
            <div className="space-y-3">
              <button
                onClick={() => { window.open(getMapsUrl(), '_blank'); setShowNavChoice(false); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-pink-200 hover:border-pink-400 hover:bg-pink-50 transition-all"
              >
                <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center shrink-0">
                  <Navigation className="h-5 w-5 text-pink-600" />
                </div>
                <div className="text-left">
                  <span className="font-bold text-pink-900 block">Google Maps</span>
                  <span className="text-xs text-pink-500">Navigation GPS</span>
                </div>
              </button>
              <button
                onClick={() => { window.open(getWazeUrl(), '_blank'); setShowNavChoice(false); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Navigation className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <span className="font-bold text-pink-900 block">Waze</span>
                  <span className="text-xs text-pink-500">Navigation communautaire</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-20 md:bottom-6 right-6 z-50"><CartSheet /></div>
      <ShareDialog isOpen={isShareDialogOpen} onOpenChange={setIsShareDialogOpen} url={shareData.url} title={shareData.title} />
      <Footer />
    </div>
  );
}
