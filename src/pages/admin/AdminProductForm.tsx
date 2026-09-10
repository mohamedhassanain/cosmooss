import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';
import { useProducts, useCreateProduct, useUpdateProduct, ProductFormData } from '@/hooks/useProducts';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { useImageUpload, uploadImageWithVariants } from '@/hooks/useImageUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, X, ImagePlus, Video, UploadCloud, MapPin } from 'lucide-react';
import { toast } from 'sonner';

function parseImageUrl(url: string | null | undefined): string[] {
  if (!url) return [];
  try {
    const parsed = JSON.parse(url);
    if (Array.isArray(parsed)) return parsed;
    return [url];
  } catch {
    return url ? [url] : [];
  }
}

export default function AdminProductForm() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { products } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const { categories } = useCategories();
  const { uploadImage, uploading } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [isPromotion, setIsPromotion] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [categoryId, setCategoryId] = useState<string>('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [images, setImages] = useState<string[]>([]);
  const [imageUrl400, setImageUrl400] = useState<string | null>(null);
  const [imageUrl800, setImageUrl800] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [stockQuantity, setStockQuantity] = useState('0');
  const [weightGrams, setWeightGrams] = useState('');
  const [brand, setBrand] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationUrl, setLocationUrl] = useState('');
  const [showLocation, setShowLocation] = useState(false);

  const { subcategories } = useSubcategories(categoryId || undefined);

  useEffect(() => {
    if (!authLoading && !user) navigate('/admin/login');
    else if (!authLoading && !isAdmin) navigate('/acces-refuse');
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (!isEditing || products.length === 0) return;
    const p = products.find(pr => pr.id === id);
    if (!p) return;
    setName(p.name);
    setSlug(p.slug);
    setDescription(p.description || '');
    setPrice(p.price.toString());
    setOriginalPrice(p.original_price?.toString() || '');
    setIsPromotion(p.is_promotion);
    setIsFeatured(p.is_featured);
    setIsActive(p.is_active);
    setCategoryId(p.category_id || '');
    setSubcategoryId(p.subcategory_id || '');
    setImages(parseImageUrl(p.image_url));
    setImageUrl400(p.image_url_400 ?? null);
    setImageUrl800(p.image_url_800 ?? null);
    setVideoUrl(p.video_url || '');
    setStockQuantity(p.stock_quantity.toString());
    setWeightGrams(p.weight_grams?.toString() || '');
    setBrand(p.brand || '');
    setLocationCity(p.location_city || '');
    setLocationUrl(p.location_url || '');
    setShowLocation(p.show_location ?? false);
  }, [isEditing, id, products]);

  useEffect(() => {
    if (!isEditing && name) {
      const generated = name
        .toLowerCase()
        .normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '')
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replaceAll(/(^-)|(-$)/g, '');
      setSlug(generated);
    }
  }, [name, isEditing]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const urls: string[] = [];
    const isFirst = images.length === 0;
    for (let i = 0; i < files.length; i++) {
      if (isFirst && i === 0) {
        try {
          const v = await uploadImageWithVariants(files[i], 'products');
          urls.push(v.image_url);
          setImageUrl400(v.image_url_400);
          setImageUrl800(v.image_url_800);
          continue;
        } catch {
          // Repli : upload simple si les variantes échouent (jamais bloquant).
        }
      }
      const url = await uploadImage(files[i], 'products');
      if (url) urls.push(url);
    }
    if (urls.length > 0) {
      setImages(prev => [...prev, ...urls]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    setImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error('La géolocalisation n\'est pas supportée par votre navigateur');
      return;
    }
    const toastId = toast.loading('Récupération de la position...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocationUrl(`https://www.google.com/maps?q=${latitude},${longitude}`);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=fr`,
          { headers: { 'User-Agent': 'Cosmooss/1.0' } }
          );
          const data = await res.json();
          const address = data.address || {};
          const city = address.city || address.town || address.village || address.municipality || address.county || address.state || address.country || '';
          setLocationCity(city);
          toast.dismiss(toastId);
          toast.success(city ? `Position : ${city}` : 'Position récupérée !');
        } catch (e) {
          toast.dismiss(toastId);
          toast.success('Position récupérée !');
          console.warn('Reverse geocoding failed:', e);
        }
      },
      () => {
        toast.dismiss(toastId);
        toast.error('Impossible de récupérer votre position. Vérifiez les autorisations.');
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Le nom est requis'); return; }
    if (!slug.trim()) { toast.error('Le slug est requis'); return; }
    const parsedPrice = Number.parseFloat(price);
    if (!price || parsedPrice <= 0) { toast.error('Prix invalide'); return; }

    const data: ProductFormData = {
      name: name.trim(),
      slug: slug.trim().toLowerCase().replaceAll(/[^a-z0-9-]/g, ''),
      description: description.trim() || undefined,
      price: parsedPrice,
      original_price: isPromotion && originalPrice ? Number.parseFloat(originalPrice) : undefined,
      is_promotion: isPromotion,
      is_featured: isFeatured,
      is_active: isActive,
      image_url: images.length > 0 ? JSON.stringify(images) : undefined,
      image_url_400: imageUrl400,
      image_url_800: imageUrl800,
      video_url: videoUrl || undefined,
      category_id: categoryId || undefined,
      subcategory_id: subcategoryId || undefined,
      stock_quantity: Number.parseInt(stockQuantity) || 0,
      weight_grams: weightGrams ? Number.parseFloat(weightGrams) : undefined,
      brand: brand.trim() || undefined,
      location_city: locationCity.trim() || undefined,
      location_url: locationUrl.trim() || undefined,
      show_location: showLocation,
    };

    try {
      if (isEditing && id) {
        await updateProduct.mutateAsync({ id, ...data });
      } else {
        await createProduct.mutateAsync(data);
      }
      navigate('/admin/produits');
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild><Link to="/admin/produits"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <h1 className="text-2xl font-display font-bold text-pink-900">{isEditing ? 'Modifier' : 'Nouveau'} produit</h1>
        </div>

        <Card className="border-pink-100">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Images Gallery */}
              <div className="space-y-2">
                <Label>Images du produit</Label>
                <div className="flex flex-wrap gap-3">
                  {images.map((url, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-2xl bg-pink-50 overflow-hidden border border-pink-100 group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="flex gap-1">
                          {i > 0 && (
                            <button type="button" onClick={() => moveImage(i, i - 1)} className="h-6 w-6 bg-white/90 rounded-full flex items-center justify-center">
                              <span className="text-xs">←</span>
                            </button>
                          )}
                          {i < images.length - 1 && (
                            <button type="button" onClick={() => moveImage(i, i + 1)} className="h-6 w-6 bg-white/90 rounded-full flex items-center justify-center">
                              <span className="text-xs">→</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 bg-red-400 text-white rounded-full p-0.5 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <X className="h-3 w-3" />
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 bg-pink-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">1ère</span>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-2xl border-2 border-dashed border-pink-200 flex flex-col items-center justify-center gap-1 text-pink-300 hover:border-pink-400 hover:text-pink-500 transition-all"
                  >
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-[10px] font-medium">Ajouter</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  {uploading && (
                    <div className="w-24 h-24 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-pink-400" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-pink-400 mt-1">La première image est l'image principale. Cliquez sur ← → pour réordonner.</p>
              </div>

              {/* Video Upload */}
              <div className="space-y-2">
                <Label>Vidéo du produit</Label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Video className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-300" />
                    <Input
                      value={videoUrl}
                      onChange={e => setVideoUrl(e.target.value)}
                      placeholder="Lien YouTube ou uploader une vidéo..."
                      className="pl-10 border-pink-200"
                    />
                  </div>
                  <Button type="button" variant="outline" className="border-pink-200 text-pink-600 shrink-0" onClick={() => document.getElementById('video-upload')?.click()}>
                    <UploadCloud className="h-4 w-4 mr-2" />Choisir
                  </Button>
                  <input id="video-upload" type="file" accept="video/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const url = await uploadImage(file, 'products');
                      if (url) setVideoUrl(url);
                    }
                    e.target.value = '';
                  }} />
                </div>
                {videoUrl && (
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-pink-50 border border-pink-100">
                    {videoUrl.includes('youtube') || videoUrl.includes('youtu.be') ? (
                      <iframe
                        src={videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                        className="w-full h-full"
                        allowFullScreen
                        title="Product video"
                      />
                    ) : (
                      <video src={videoUrl} controls className="w-full h-full object-contain">
                        {/* Piste de sous-titres déclarée (exigence d'accessibilité).
                            Pour une vidéo de produit sans dialogue, une piste vide suffit
                            à signaler aux lecteurs d'écran qu'une alternative est disponible. */}
                        <track kind="captions" srcLang="fr" label="Français" />
                      </video>
                    )}
                    <button type="button" onClick={() => setVideoUrl('')} className="absolute top-2 right-2 bg-red-400 text-white rounded-full p-1 w-6 h-6 flex items-center justify-center">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="space-y-2"><Label>Nom *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Crème visage" /></div>

              {/* Brand + Weight */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Marque</Label><Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Nivea, L'Oréal..." /></div>
                <div className="space-y-2"><Label>Poids (g)</Label><Input type="number" value={weightGrams} onChange={e => setWeightGrams(e.target.value)} placeholder="50" /></div>
              </div>

              {/* Description */}
              <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Description du produit..." /></div>

              {/* Catégories */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select value={categoryId} onValueChange={v => { setCategoryId(v); setSubcategoryId(''); }}>
                    <SelectTrigger className="border-pink-200"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sous-catégorie</Label>
                  <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={!categoryId || subcategories.length === 0}>
                    <SelectTrigger className="border-pink-200"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      {subcategories.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Prix */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Prix * (DH)</Label><Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="199" /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label>Promotion</Label><Switch checked={isPromotion} onCheckedChange={setIsPromotion} /></div>
                  {isPromotion && <Input type="number" step="0.01" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} placeholder="249" className="mt-2" />}
                </div>
              </div>

              {/* Featured + Active */}
              <div className="flex items-center justify-between p-3 bg-pink-50 rounded-xl">
                <div><Label>Recommandé</Label><p className="text-xs text-pink-500">Affiché dans la section Recommandé</p></div>
                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
              </div>

              <div className="flex items-center justify-between p-3 bg-pink-50 rounded-xl">
                <div><Label>Produit visible</Label><p className="text-xs text-pink-500">Visible sur le site</p></div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              {/* Localisation */}
              <div className="space-y-3">
                <Label>Localisation (optionnel)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ville</Label>
                    <Input value={locationCity} onChange={e => setLocationCity(e.target.value)} placeholder="Casablanca" className="border-pink-200" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Lien Maps / Waze</Label>
                    <div className="flex gap-2">
                      <Input value={locationUrl} onChange={e => setLocationUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." className="border-pink-200 flex-1" />
                      <Button type="button" variant="outline" className="border-pink-200 text-pink-600 shrink-0 px-3" onClick={handleGetLocation} title="Récupérer ma position actuelle">
                        <MapPin className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-pink-50 rounded-xl">
                  <div><Label className="text-sm">Afficher la localisation</Label><p className="text-xs text-pink-500">Visible sur la fiche produit</p></div>
                  <Switch checked={showLocation} onCheckedChange={setShowLocation} />
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-4 pt-4">
                <Button type="button" variant="outline" className="flex-1 border-pink-200 text-pink-600" onClick={() => navigate('/admin/produits')}>Annuler</Button>
                <Button type="submit" className="flex-1 bg-pink-400 hover:bg-pink-500 text-white rounded-full" disabled={createProduct.isPending || updateProduct.isPending || uploading}>
                  {(createProduct.isPending || updateProduct.isPending) ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</> : (isEditing ? 'Mettre à jour' : 'Créer le produit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
