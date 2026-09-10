/**
 * Couche d'accès aux données catégories & sous-catégories (Supabase).
 */
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { Category, Subcategory } from '@/types/product';
import { slugify } from '@/lib/utils';

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    // Colonnes rendues par l'UI + description (SEO catégorie : meta description
    // réelle, jamais inventée). Le tri serveur par sort_order fonctionne sans
    // sélectionner la colonne.
    .select('id, name, slug, description')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as Category[];
}

export interface CategoryInput {
  name: string;
  slug: string;
  description?: string;
}

export async function createCategory(input: CategoryInput): Promise<unknown> {
  const { data, error } = await supabase
    .from('categories')
    .insert([{ name: input.name, slug: input.slug, description: input.description || null }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput>
): Promise<unknown> {
  const updateData: TablesUpdate<'categories'> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.slug !== undefined) updateData.slug = input.slug;
  if (input.description !== undefined) updateData.description = input.description;

  const { data, error } = await supabase
    .from('categories')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchSubcategories(categoryId: string): Promise<Subcategory[]> {
  const { data, error } = await supabase
    .from('subcategories')
    .select('id, category_id, name, slug')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as Subcategory[];
}

/**
 * Toutes les sous-catégories en UNE requête (footer, menus).
 * Remplace le pattern N+1 où le footer déclenchait une requête par catégorie.
 */
export async function fetchAllSubcategories(): Promise<Subcategory[]> {
  const { data, error } = await supabase
    .from('subcategories')
    .select('id, category_id, name, slug')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as Subcategory[];
}

export async function createSubcategory(categoryId: string, name: string): Promise<unknown> {
  // Le slug est généré automatiquement depuis le nom (ex: "Crème Visage" → "creme-visage").
  const { data, error } = await supabase
    .from('subcategories')
    .insert([{ category_id: categoryId, name, slug: slugify(name) }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSubcategory(id: string, name: string): Promise<unknown> {
  const { data, error } = await supabase
    .from('subcategories')
    .update({ name, slug: slugify(name) })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSubcategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('subcategories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
