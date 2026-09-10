import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openWhatsAppOrder, getProductShareData, parseImages } from '../whatsapp.service';

// Mocks des dépendances
vi.mock('@/services/site-settings.service', () => ({
  fetchWhatsAppNumber: vi.fn(),
}));

vi.mock('@/services/order.service', () => ({
  submitPublicOrder: vi.fn(),
}));

import { fetchWhatsAppNumber } from '@/services/site-settings.service';
import { submitPublicOrder } from '@/services/order.service';

const mockedFetchWhatsApp = vi.mocked(fetchWhatsAppNumber);
const mockedSubmitPublicOrder = vi.mocked(submitPublicOrder);

function makeProduct() {
  return {
    id: 'p1',
    name: 'Crème Visage',
    slug: 'creme-visage',
    price: 99,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // L'URL du produit utilise globalThis.location.origin
    vi.stubGlobal('location', { origin: 'https://cosmooss.example' });
  vi.spyOn(globalThis, 'open').mockImplementation(() => null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('whatsapp.service', () => {
  describe('openWhatsAppOrder', () => {
    it('ouvre WhatsApp quand submitPublicOrder échoue (ne bloque pas)', async () => {
      mockedFetchWhatsApp.mockResolvedValue('+212600000000');
      mockedSubmitPublicOrder.mockRejectedValue(new Error('429: too many requests'));

      await expect(openWhatsAppOrder(makeProduct())).resolves.toBeUndefined();

      // L'échec du tracking NE doit PAS empêcher l'ouverture de WhatsApp
      expect(globalThis.open).toHaveBeenCalledWith(
        expect.stringContaining('https://wa.me/212600000000'),
        '_blank'
      );
    });

    it('ouvre WhatsApp quand submitPublicOrder réussit', async () => {
      mockedFetchWhatsApp.mockResolvedValue('+212600000000');
      mockedSubmitPublicOrder.mockResolvedValue({ ok: true });

      await openWhatsAppOrder(makeProduct());

      expect(globalThis.open).toHaveBeenCalledTimes(1);
      expect(mockedSubmitPublicOrder).toHaveBeenCalledTimes(1);
    });

    it('appelle submitPublicOrder avec les infos du produit (commande WhatsApp Click)', async () => {
      mockedFetchWhatsApp.mockResolvedValue('+212600000000');
      mockedSubmitPublicOrder.mockResolvedValue({ ok: true });

      await openWhatsAppOrder(makeProduct());

      expect(mockedSubmitPublicOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: 'p1',
          product_name: 'Crème Visage',
          quantity: 1,
          total_price: 99,
          status: 'pending',
          notes: 'Clic depuis le site',
        })
      );
    });
  });

  describe('getProductShareData', () => {
    it('génère l’URL de partage du produit', () => {
      const data = getProductShareData(makeProduct());
    expect(data.url).toBe('https://cosmooss.example/produit/creme-visage');
      expect(data.title).toBe('Crème Visage');
    });
  });

  describe('parseImages', () => {
    it('parse un JSON array', () => {
      expect(parseImages('["a.png","b.png"]')).toEqual(['a.png', 'b.png']);
    });

    it('retourne une URL simple en array', () => {
      expect(parseImages('a.png')).toEqual(['a.png']);
    });

    it('retourne [] si null/undefined', () => {
      expect(parseImages(null)).toEqual([]);
      expect(parseImages(undefined)).toEqual([]);
    });
  });
});
