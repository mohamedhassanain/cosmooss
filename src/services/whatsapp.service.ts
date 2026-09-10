/**
 * Logique métier WhatsApp : numéro, ordre silencieux et liens de partage.
 * Indépendant de React — utilisable depuis hooks et composants.
 */
import { formatWhatsAppNumber } from '@/lib/utils';
import { Product } from '@/types/product';
import { submitPublicOrder } from '@/services/order.service';
import { fetchWhatsAppNumber } from '@/services/site-settings.service';

const FALLBACK_WHATSAPP_NUMBER = '+212600000000';

/**
 * Verrou anti-double-clic (niveau module) : une seule commande WhatsApp
 * peut être en vol à la fois. Empêche les INSERT `orders` en double quand
 * l'utilisateur clique plusieurs fois rapidement (le tracking est public).
 */
let whatsappOrderInFlight = false;

export interface ShareData {
  url: string;
  title: string;
}

export function parseImages(imageUrl: string | null | undefined): string[] {
  if (!imageUrl) return [];
  try {
    const parsed = JSON.parse(imageUrl);
    if (Array.isArray(parsed)) return parsed;
    return [imageUrl];
  } catch {
    return [imageUrl];
  }
}

async function getWhatsAppNumber(): Promise<string> {
  try {
    const number = await fetchWhatsAppNumber();
    return number || FALLBACK_WHATSAPP_NUMBER;
  } catch {
    return FALLBACK_WHATSAPP_NUMBER;
  }
}

/**
 * Ouvre WhatsApp avec le message de commande pour un produit.
 * Enregistre un ordre silencieux « WhatsApp Click » (non bloquant en cas d'échec).
 */
export async function openWhatsAppOrder(product: Product): Promise<void> {
  if (whatsappOrderInFlight) return;
  whatsappOrderInFlight = true;

  try {
    const whatsappNumber = await getWhatsAppNumber();

    if (!whatsappNumber?.trim()) {
      throw new Error('Numéro WhatsApp non configuré');
    }

    try {
      // Tracking PUBLIC via l'Edge Function `create-order` (rate limitée).
      // Le prix est calculé côté serveur à partir du catalogue.
      await submitPublicOrder({
        product_id: product.id,
        product_name: product.name,
        customer_name: 'WhatsApp Click',
        customer_phone: whatsappNumber,
        quantity: 1,
        total_price: product.price,
        status: 'pending',
        notes: 'Clic depuis le site',
      });
    } catch {
      // Échec silencieux : le tracking ne doit pas bloquer l'utilisateur
    }

    const productUrl = `${globalThis.location.origin}/produit/${product.slug}`;
    const message = `${productUrl}\n\nBonjour! J'ai vu votre produit *${product.name}* sur Cosmooss. Est-il toujours disponible?`;
    const whatsappUrl = `https://wa.me/${formatWhatsAppNumber(whatsappNumber)}?text=${encodeURIComponent(message)}`;
    globalThis.open(whatsappUrl, '_blank');
  } finally {
    whatsappOrderInFlight = false;
  }
}

/** Lien de partage d'un produit. */
export function getProductShareData(product: Product): ShareData {
  const url = `${globalThis.location.origin}/produit/${product.slug}`;
  return {
    url,
    title: product.name || 'Produit',
  };
}
