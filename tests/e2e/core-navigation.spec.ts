/**
 * Core public navigation E2E coverage.
 */
import { expect, test } from '@playwright/test';

test.describe('Public navigation', () => {
  test('explore, terms, and privacy pages render expected content', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: 'Asset Tokenization' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Create an Account/i }).first()).toBeVisible();

    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: /Terms of Service/i })).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
  });

  test('protected routes redirect anonymous users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();

    await page.goto('/advanced');
    await expect(page).toHaveURL(/\/login$/);
  });
});
