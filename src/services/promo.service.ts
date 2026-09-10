/**
 * Couche d'accès aux publicités (carrousel du hero) — Supabase.
 */
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { Promo, PromoInput } from '@/types/site';

/**
 * Vrai si l'erreur vient d'une table manquante (404 / relation "promos" absente).
 * Permet de dégrader proprement quand la migration SQL n'a pas encore été exécutée.
 */
function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; status?: number };
  return e?.code === '42P01' || e?.status === 404 ||
    (typeof e?.message === 'string' && e.message.includes('does not exist'));
}

/** Colonnes réellement rendues par le carrousel public. */
const PROMO_SELECT_PUBLIC = 'id, badge, title, subtitle, link, image_url, sort_order';

export async function fetchActivePromos(): Promise<Promo[]> {
  try {
    const { data, error } = await supabase
      .from('promos')
      .select(PROMO_SELECT_PUBLIC)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data || []) as Promo[];
  } catch (error) {
    // Table pas encore créée → aucun carrousel, sans casser l'app.
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function fetchAllPromos(): Promise<Promo[]> {
  try {
    const { data, error } = await supabase
      .from('promos')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data || []) as Promo[];
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function createPromo(input: PromoInput): Promise<unknown> {
  const { data, error } = await supabase
    .from('promos')
    .insert([{
      badge: input.badge ?? null,
      title: input.title,
      subtitle: input.subtitle ?? null,
      link: input.link || '/produits?promotions=true',
      image_url: input.image_url ?? null,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    }])
    .select()
    .single();

  if (error) throw new Error(buildPromoError(error));
  return data;
}

export async function updatePromo(id: string, input: Partial<PromoInput>): Promise<unknown> {
  const updateData: TablesUpdate<'promos'> = {};
  if (input.badge !== undefined) updateData.badge = input.badge;
  if (input.title !== undefined) updateData.title = input.title;
  if (input.subtitle !== undefined) updateData.subtitle = input.subtitle;
  if (input.link !== undefined) updateData.link = input.link;
  if (input.image_url !== undefined) updateData.image_url = input.image_url;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;

  const { data, error } = await supabase
    .from('promos')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(buildPromoError(error));
  return data;
}

export async function deletePromo(id: string): Promise<void> {
  const { error } = await supabase
    .from('promos')
    .delete()
    .eq('id', id);

  if (error) throw new Error(buildPromoError(error));
}

/** Message d'erreur clair si la table promos n'existe pas encore (migration à exécuter). */
function buildPromoError(error: unknown): string {
  if (isMissingTableError(error)) {
    return "La table 'promos' n'existe pas encore. Exécutez le fichier supabase/database.sql dans le SQL Editor Supabase.";
  }
  return (error as Error)?.message || 'Erreur inconnue';
}
