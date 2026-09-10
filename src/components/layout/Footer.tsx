import { Link } from 'react-router-dom';
import Logo from './Logo';
import { useCategories, useAllSubcategories } from '@/hooks/useCategories';
import { MessageCircle, Flower2 } from 'lucide-react';
import type { Subcategory } from '@/types/product';

function CategoryColumn({ cat, subcategories }: { cat: { id: string; name: string; slug: string }; subcategories: Subcategory[] }) {
  return (
    <div>
      <Link
        to={`/produits?categorie=${cat.slug}`}
        className="font-bold text-gray-800 mb-2 block hover:text-pink-600 transition-colors"
      >
        {cat.name}
      </Link>
      {subcategories.length > 0 && (
        <ul className="space-y-1 text-sm">
          {subcategories.map(sub => (
            <li key={sub.id}>
              <Link
                to={`/produits?categorie=${cat.slug}&sous-categorie=${sub.slug ?? sub.name.toLowerCase()}`}
                className="text-gray-500 hover:text-pink-600 transition-colors"
              >
                {sub.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Footer() {
  const { categories } = useCategories();
  // Une seule requête pour TOUTES les sous-catégories (remplace le N+1
  // « une requête par catégorie » observé sur chaque page).
  const { subcategories: allSubcategories } = useAllSubcategories();

  const subFor = (categoryId: string) => allSubcategories.filter((s) => s.category_id === categoryId);

  const chunkSize = Math.ceil(categories.length / 5);
  const col1 = categories.slice(0, chunkSize);
  const col2 = categories.slice(chunkSize, chunkSize * 2);
  const col3 = categories.slice(chunkSize * 2, chunkSize * 3);
  const col4 = categories.slice(chunkSize * 3, chunkSize * 4);
  const col5 = categories.slice(chunkSize * 4);

  return (
    <footer className="mt-20">
      {/* Top section: Categories & Subcategories */}
      <div className="bg-white border-t border-gray-200 py-10 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {[col1, col2, col3, col4, col5].map((cols, i) => (
              <div key={i} className="space-y-6">
                {cols.map(cat => (
                  <CategoryColumn key={cat.id} cat={cat} subcategories={subFor(cat.id)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom section: Info, Legal, Follow us */}
      <div className="bg-[#1f2b3d] text-gray-300 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Brand & About */}
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                <Logo className="h-8 w-8" />
                <span className="font-display font-bold text-lg text-white">Cosmooss</span>
              </Link>
              <ul className="space-y-2 text-sm">
                <li><Link to="/" className="hover:text-white transition-colors">Accueil</Link></li>
                <li><Link to="/produits" className="hover:text-white transition-colors">Tous les produits</Link></li>
                <li><Link to="/produits?promotions=true" className="hover:text-white transition-colors">Promotions</Link></li>
                <li><Link to="/contact" className="hover:text-white transition-colors">Contact</Link></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Informations légales</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="#" className="hover:text-white transition-colors">Conditions générales</Link></li>
                <li><Link to="#" className="hover:text-white transition-colors">Politique de confidentialité</Link></li>
                <li><Link to="#" className="hover:text-white transition-colors">Gestion des cookies</Link></li>
                <li><Link to="#" className="hover:text-white transition-colors">Livraison & retours</Link></li>
              </ul>
            </div>

            {/* Services */}
            <div>
              <h4 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Services</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/produits?featured=true" className="hover:text-white transition-colors">Recommandé</Link></li>
                <li><Link to="/produits?promotions=true" className="hover:text-white transition-colors">Bonnes affaires</Link></li>
                <li><Link to="#" className="hover:text-white transition-colors">Fidélité</Link></li>
              </ul>
            </div>

            {/* Follow us */}
            <div>
              <h4 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Suivez-nous</h4>
              <div className="flex gap-3 mb-4">
                <button type="button" aria-label="Instagram" className="h-9 w-9 rounded-full bg-gray-600 flex items-center justify-center hover:bg-pink-500 transition-all border-none cursor-pointer">
                  <Flower2 className="h-4 w-4 text-white" />
                </button>
                <button type="button" aria-label="WhatsApp" className="h-9 w-9 rounded-full bg-gray-600 flex items-center justify-center hover:bg-green-500 transition-all border-none cursor-pointer">
                  <MessageCircle className="h-4 w-4 text-white" />
                </button>
              </div>
              <p className="text-xs text-gray-500">© 2026 Cosmooss</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
