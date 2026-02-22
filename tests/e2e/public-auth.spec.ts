import { expect, test } from '@playwright/test';

test.describe('Public and Auth Routing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('unauthenticated users are redirected to login for protected routes', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });

  test('route title and live announcer update on public route navigation', async ({
    page,
  }) => {
    await page.goto('/explore');
    await expect(page).toHaveTitle(/Explore \| Fueki/);

    await page.getByRole('link', { name: 'Sign In' }).first().click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page).toHaveTitle(/Sign In \| Fueki/);
    await expect(page.locator('#route-announcer')).toContainText(
      'Navigated to Sign In',
    );
  });

  test('unknown routes show a recoverable 404 page', async ({ page }) => {
    await page.goto('/does-not-exist');

    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to Login' }).click();

    await expect(page).toHaveURL(/\/login$/);
  });
});
