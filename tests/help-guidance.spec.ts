import { test, expect } from '@playwright/test';

test.describe('Help Guidance Onboarding', () => {
  test('signup includes help-level selector and allows switching tiers', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Help mode')).toBeVisible();

    const guided = page.getByRole('radio', { name: /Guided/i });
    const balanced = page.getByRole('radio', { name: /Balanced/i });
    const minimal = page.getByRole('radio', { name: /Minimal/i });

    await expect(guided).toBeChecked();
    await balanced.check();
    await expect(balanced).toBeChecked();
    await minimal.check();
    await expect(minimal).toBeChecked();
  });
});
