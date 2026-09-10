import { test, expect } from '@playwright/test';

/**
 * Smoke tests E2E — vérifient le rendu structural de l'application
 * sans dépendre des données peuplées dans Supabase. On valide que
 * les pages rendent sans écran vide, que la navigation fonctionne
 * et que le panier s'ouvre.
 */

test('la page d’accueil rend le header, la navigation et le footer', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Cosmooss|Cosmétiqu/);
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
});

test('la page /produits rend sans écran vide', async ({ page }) => {
  await page.goto('/produits');
  // État vide accepté (pas de données) : on vérifie l'absence de crash.
  await expect(page.locator('body')).not.toBeEmpty();
});

test('sans session, /admin redirige vers /admin/login (et non vers l’accueil)', async ({ page }) => {
  await page.goto('/admin');
  // Régression : l'accès admin ne doit JAMAIS rebondir silencieusement vers "/".
  // Le login admin canonique est /admin/login (l'ancien /auth reste un alias).
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('le panier s’ouvre via le bouton flottant (aria-label)', async ({ page }) => {
  await page.goto('/');
  const cartButton = page.getByRole('button', { name: 'Ouvrir le panier' });
  await expect(cartButton).toBeVisible();
  await cartButton.click();
  await expect(page.locator('[role="dialog"]').first()).toBeVisible();
});

test('une route inconnue affiche la page 404', async ({ page }) => {
  await page.goto('/route-inexistante-xyz');
  await expect(page.locator('body')).toContainText('introuvable');
});

test('la fiche produit d’un slug inconnu affiche "Produit introuvable"', async ({ page }) => {
  await page.goto('/produit/inexistant-e2e');
  await expect(page.locator('body')).toContainText('Produit introuvable');
});
